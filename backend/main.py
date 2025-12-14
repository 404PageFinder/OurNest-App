from datetime import datetime, timedelta
import hashlib
import hmac
import secrets
import os
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator
from jose import JWTError, jwt

from sqlalchemy.orm import Session
from sqlalchemy import func, case, distinct

from db import Base, engine, get_db
import models

# ---------- Configuration ----------

SECRET_KEY = os.getenv("SECRET_KEY", "TEMP_SECRET_CHANGE_IN_PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5
MOBILE_REGEX = r"^[6-9]\d{9}$"

# ---------- FastAPI App Setup ----------

app = FastAPI(
    title="OurNest API",
    description="Apartment Management System",
    version="2.0.0"
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://ournest-app.vercel.app",
        "https://*.vercel.app",
    ],
    allow_credentials=True,  # ← THIS IS CRITICAL!
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

# Add compression for responses > 1KB
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Security
security = HTTPBearer()

# ---------- Database Initialization ----------

Base.metadata.create_all(bind=engine)

# ---------- OTP Store ----------

class OtpRecord(BaseModel):
    request_id: str
    mobile: str
    otp_hash: str
    created_at: datetime
    expires_at: datetime
    attempts: int = 0
    status: str = "pending"

otp_store: Dict[str, OtpRecord] = {}

# ---------- Helper Functions ----------

def hash_otp(otp: str, mobile: str) -> str:
    """Hash OTP with mobile number as salt"""
    return hmac.new(
        SECRET_KEY.encode(),
        f"{mobile}:{otp}".encode(),
        hashlib.sha256
    ).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return mobile number"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        mobile: str = payload.get("sub")
        
        if mobile is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        return mobile
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

# ---------- Pydantic Models for Auth ----------

class SendOtpRequest(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

class SendOtpResponse(BaseModel):
    request_id: str
    message: str
    expires_in_minutes: int

class VerifyOtpRequest(BaseModel):
    request_id: str
    mobile: str
    otp: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v):
        if not v.isdigit() or len(v) != 4:
            raise ValueError("OTP must be 4 digits.")
        return v

class VerifyOtpResponse(BaseModel):
    success: bool
    message: str
    access_token: str
    token_type: str = "bearer"

# ---------- Pydantic Models for Apartments ----------

class ApartmentCreateRequest(BaseModel):
    name: str
    city: str
    total_units: int

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Apartment name must be at least 2 characters.")
        return v

    @field_validator("city")
    @classmethod
    def validate_city(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError("City name must be at least 2 characters.")
        return v

    @field_validator("total_units")
    @classmethod
    def validate_units(cls, v):
        if v <= 0:
            raise ValueError("Total units must be greater than zero.")
        return v

class ApartmentResponse(BaseModel):
    id: int
    name: str
    city: str
    total_units: int

    class Config:
        from_attributes = True

class ApartmentListResponse(BaseModel):
    apartments: List[ApartmentResponse]

# ---------- Pydantic Models for Units ----------

class UnitCreateRequest(BaseModel):
    name: str
    bhk_type: str
    status: str = "vacant"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 1:
            raise ValueError("Unit name/number cannot be empty.")
        return v

    @field_validator("bhk_type")
    @classmethod
    def validate_bhk(cls, v):
        allowed = {"1BHK", "2BHK", "3BHK", "4BHK"}
        v = v.upper()
        if v not in allowed:
            raise ValueError(f"bhk_type must be one of {', '.join(sorted(allowed))}.")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        v = v.lower()
        allowed = {"vacant", "occupied"}
        if v not in allowed:
            raise ValueError("status must be 'vacant' or 'occupied'.")
        return v

class BulkUnitCreateRequest(BaseModel):
    """Create multiple units at once"""
    start_number: int
    end_number: int
    prefix: str = ""
    bhk_type: str = "2BHK"

class UnitResponse(BaseModel):
    id: int
    apartment_id: int
    name: str
    bhk_type: str
    status: str

    class Config:
        from_attributes = True

class UnitListResponse(BaseModel):
    units: List[UnitResponse]

# ---------- Pydantic Models for Occupants ----------

class OccupantCreateRequest(BaseModel):
    name: str
    phone: str
    role: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        v = v.strip()
        if len(v) < 6:
            raise ValueError("Phone number looks too short.")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        v = v.lower()
        if v not in {"owner", "tenant"}:
            raise ValueError("Role must be 'owner' or 'tenant'.")
        return v

class OccupantResponse(BaseModel):
    id: int
    unit_id: int
    name: str
    phone: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class OccupantListResponse(BaseModel):
    occupants: List[OccupantResponse]

# ---------- Pydantic Models for Invoices ----------

class InvoiceCreateRequest(BaseModel):
    period_label: str
    amount: int
    due_date: str

    @field_validator("period_label")
    @classmethod
    def validate_period(cls, v):
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Period label must be at least 3 characters.")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be greater than zero.")
        return v

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v):
        v = v.strip()
        if len(v) < 4:
            raise ValueError("Due date looks invalid.")
        return v

class InvoiceResponse(BaseModel):
    id: int
    unit_id: int
    period_label: str
    amount: int
    due_date: str
    status: str
    created_at: datetime | None
    paid_at: datetime | None

    class Config:
        from_attributes = True

class InvoiceListResponse(BaseModel):
    invoices: List[InvoiceResponse]

class MarkInvoicePaidRequest(BaseModel):
    pass  # No body needed, just auth

# ---------- Pydantic Models for Dashboard ----------

class ApartmentDashboardItemResponse(BaseModel):
    apartment_id: int
    apartment_name: str
    total_units: int
    occupied_units: int
    vacant_units: int
    total_invoices: int
    total_due_amount: int
    total_paid_amount: int

class DashboardResponse(BaseModel):
    apartments: List[ApartmentDashboardItemResponse]
    overall_due_amount: int
    overall_paid_amount: int

# ---------- Health Check ----------

# ========== ROOT & HEALTH ENDPOINTS ==========

@app.get("/")
def root():
    """Root endpoint - shows API is running"""
    return {
        "message": "OurNest API is running!",
        "version": "1.0.0",
        "status": "ok",
        "endpoints": {
            "health": "/health",
            "docs": "/docs", 
            "auth": "/auth/send-otp",
            "dashboard": "/dashboard"
        }
    }

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "ok",
        "version": "1.0.0",
        "database": "connected"
    }

# ---------- Auth Endpoints ----------

@app.post("/auth/send-otp", response_model=SendOtpResponse)
def send_otp(data: SendOtpRequest, db: Session = Depends(get_db)):
    """Send OTP to mobile number"""
    request_id = secrets.token_urlsafe(32)
    otp = f"{secrets.randbelow(10000):04d}"
    
    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    
    otp_hash = hash_otp(otp, data.mobile)
    
    otp_store[request_id] = OtpRecord(
        request_id=request_id,
        mobile=data.mobile,
        otp_hash=otp_hash,
        created_at=now,
        expires_at=expires_at,
        attempts=0,
        status="pending"
    )
    
    print(f"[DEV MODE] OTP for {data.mobile}: {otp}")
    
    return SendOtpResponse(
        request_id=request_id,
        message=f"OTP sent to {data.mobile}",
        expires_in_minutes=OTP_TTL_MINUTES
    )

@app.post("/auth/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(data: VerifyOtpRequest, db: Session = Depends(get_db)):
    """Verify OTP and return JWT token"""
    record = otp_store.get(data.request_id)
    
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OTP request not found or expired."
        )
    
    if record.status == "verified":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP already verified."
        )
    
    if record.mobile != data.mobile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number mismatch."
        )
    
    if datetime.utcnow() > record.expires_at:
        record.status = "expired"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired."
        )
    
    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts."
        )
    
    record.attempts += 1
    input_hash = hash_otp(data.otp, data.mobile)
    
    if input_hash != record.otp_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP."
        )
    
    record.status = "verified"
    
    # Get or create user
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        user = models.User(mobile=data.mobile, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.last_login_at = datetime.utcnow()
        db.commit()
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.mobile})
    
    return VerifyOtpResponse(
        success=True,
        message="OTP verified successfully",
        access_token=access_token
    )

# ---------- Apartment Endpoints ----------

@app.post("/apartments", response_model=ApartmentResponse)
def create_apartment(
    data: ApartmentCreateRequest,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create new apartment (requires auth)"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    apartment = models.Apartment(
        name=data.name.strip(),
        city=data.city.strip(),
        total_units=data.total_units,
        created_by_user_id=user.id,
    )
    db.add(apartment)
    db.commit()
    db.refresh(apartment)
    
    return apartment

@app.get("/apartments", response_model=ApartmentListResponse)
def list_apartments(
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List all apartments for authenticated user"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    apartments = (
        db.query(models.Apartment)
        .filter(models.Apartment.created_by_user_id == user.id)
        .order_by(models.Apartment.created_at.desc())
        .all()
    )
    
    return ApartmentListResponse(apartments=apartments)

# ---------- Unit Endpoints ----------

@app.post("/apartments/{apartment_id}/units", response_model=UnitResponse)
def create_unit(
    apartment_id: int,
    data: UnitCreateRequest,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create new unit in apartment"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    apartment = (
        db.query(models.Apartment)
        .filter(
            models.Apartment.id == apartment_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if apartment is None:
        raise HTTPException(
            status_code=404,
            detail="Apartment not found for this user.",
        )
    
    # Check for duplicate unit name
    existing = (
        db.query(models.Unit)
        .filter(
            models.Unit.apartment_id == apartment_id,
            models.Unit.name == data.name.strip()
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Unit {data.name} already exists in this apartment."
        )
    
    unit = models.Unit(
        apartment_id=apartment.id,
        name=data.name.strip(),
        bhk_type=data.bhk_type.upper(),
        status=data.status.lower(),
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    
    return unit

@app.post("/apartments/{apartment_id}/units/bulk", response_model=UnitListResponse)
def bulk_create_units(
    apartment_id: int,
    data: BulkUnitCreateRequest,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create multiple units at once"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    apartment = (
        db.query(models.Apartment)
        .filter(
            models.Apartment.id == apartment_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if apartment is None:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    
    if data.start_number > data.end_number:
        raise HTTPException(status_code=400, detail="Start number must be <= end number.")
    
    if data.end_number - data.start_number > 100:
        raise HTTPException(status_code=400, detail="Cannot create more than 100 units at once.")
    
    units = []
    for i in range(data.start_number, data.end_number + 1):
        unit = models.Unit(
            apartment_id=apartment_id,
            name=f"{data.prefix}{i}",
            bhk_type=data.bhk_type.upper(),
            status="vacant"
        )
        units.append(unit)
    
    db.add_all(units)
    db.commit()
    
    return UnitListResponse(units=units)

@app.get("/apartments/{apartment_id}/units", response_model=UnitListResponse)
def list_units(
    apartment_id: int,
    mobile: str = Depends(verify_token),
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List units with optional filtering"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    apartment = (
        db.query(models.Apartment)
        .filter(
            models.Apartment.id == apartment_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if apartment is None:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    
    query = db.query(models.Unit).filter(models.Unit.apartment_id == apartment.id)
    
    if status:
        query = query.filter(models.Unit.status == status.lower())
    
    units = query.order_by(models.Unit.name).offset(skip).limit(limit).all()
    
    return UnitListResponse(units=units)

# ---------- Occupant Endpoints ----------

@app.post("/units/{unit_id}/occupants", response_model=OccupantResponse)
def create_occupant(
    unit_id: int,
    data: OccupantCreateRequest,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Add occupant to unit"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    unit = (
        db.query(models.Unit)
        .join(models.Apartment, models.Unit.apartment_id == models.Apartment.id)
        .filter(
            models.Unit.id == unit_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found.")
    
    occupant = models.Occupant(
        unit_id=unit.id,
        name=data.name.strip(),
        phone=data.phone.strip(),
        role=data.role.lower(),
        is_active=True,
    )
    db.add(occupant)
    
    # Update unit status
    unit.status = "occupied"
    
    db.commit()
    db.refresh(occupant)
    
    return occupant

@app.get("/units/{unit_id}/occupants", response_model=OccupantListResponse)
def list_occupants(
    unit_id: int,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List occupants of a unit"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    unit = (
        db.query(models.Unit)
        .join(models.Apartment, models.Unit.apartment_id == models.Apartment.id)
        .filter(
            models.Unit.id == unit_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found.")
    
    occupants = (
        db.query(models.Occupant)
        .filter(models.Occupant.unit_id == unit.id)
        .order_by(models.Occupant.created_at.desc())
        .all()
    )
    
    return OccupantListResponse(occupants=occupants)

# ---------- Invoice Endpoints ----------

@app.post("/units/{unit_id}/invoices", response_model=InvoiceResponse)
def create_invoice(
    unit_id: int,
    data: InvoiceCreateRequest,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create maintenance invoice"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    unit = (
        db.query(models.Unit)
        .join(models.Apartment, models.Unit.apartment_id == models.Apartment.id)
        .filter(
            models.Unit.id == unit_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found.")
    
    invoice = models.MaintenanceInvoice(
        unit_id=unit.id,
        period_label=data.period_label.strip(),
        amount=data.amount,
        due_date=data.due_date.strip(),
        status="due",
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    
    return invoice

@app.get("/units/{unit_id}/invoices", response_model=InvoiceListResponse)
def list_invoices(
    unit_id: int,
    mobile: str = Depends(verify_token),
    month: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List invoices with optional month filter"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    unit = (
        db.query(models.Unit)
        .join(models.Apartment, models.Unit.apartment_id == models.Apartment.id)
        .filter(
            models.Unit.id == unit_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found.")
    
    query = (
        db.query(models.MaintenanceInvoice)
        .filter(models.MaintenanceInvoice.unit_id == unit.id)
    )
    
    if month:
        query = query.filter(models.MaintenanceInvoice.due_date.like(f"{month}%"))
    
    invoices = query.order_by(models.MaintenanceInvoice.created_at.desc()).all()
    
    return InvoiceListResponse(invoices=invoices)

@app.post("/invoices/{invoice_id}/mark-paid", response_model=InvoiceResponse)
def mark_invoice_paid(
    invoice_id: int,
    mobile: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Mark invoice as paid"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    invoice = (
        db.query(models.MaintenanceInvoice)
        .join(models.Unit, models.MaintenanceInvoice.unit_id == models.Unit.id)
        .join(models.Apartment, models.Unit.apartment_id == models.Apartment.id)
        .filter(
            models.MaintenanceInvoice.id == invoice_id,
            models.Apartment.created_by_user_id == user.id,
        )
        .first()
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    
    invoice.status = "paid"
    invoice.paid_at = datetime.utcnow()
    
    db.commit()
    db.refresh(invoice)
    
    return invoice

# ---------- Dashboard Endpoint ----------

@app.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(mobile: str = Depends(verify_token), db: Session = Depends(get_db)):
    """Get dashboard statistics - optimized query"""
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    
    apartments = (
        db.query(models.Apartment)
        .filter(models.Apartment.created_by_user_id == user.id)
        .all()
    )
    
    items: List[ApartmentDashboardItemResponse] = []
    overall_due = 0
    overall_paid = 0
    
    for apt in apartments:
        # Optimized query with aggregations
        unit_stats = (
            db.query(
                func.count(distinct(models.Unit.id)).label('total_units'),
                func.sum(case((models.Unit.status == 'occupied', 1), else_=0)).label('occupied')
            )
            .filter(models.Unit.apartment_id == apt.id)
            .first()
        )
        
        invoice_stats = (
            db.query(
                func.count(models.MaintenanceInvoice.id).label('total_invoices'),
                func.sum(case((models.MaintenanceInvoice.status == 'paid', models.MaintenanceInvoice.amount), else_=0)).label('paid'),
                func.sum(case((models.MaintenanceInvoice.status != 'paid', models.MaintenanceInvoice.amount), else_=0)).label('due')
            )
            .join(models.Unit, models.MaintenanceInvoice.unit_id == models.Unit.id)
            .filter(models.Unit.apartment_id == apt.id)
            .first()
        )
        
        total_units = unit_stats.total_units or 0
        occupied = unit_stats.occupied or 0
        vacant = total_units - occupied
        
        total_invoices = invoice_stats.total_invoices or 0
        due_amount = invoice_stats.due or 0
        paid_amount = invoice_stats.paid or 0
        
        overall_due += due_amount
        overall_paid += paid_amount
        
        items.append(
            ApartmentDashboardItemResponse(
                apartment_id=apt.id,
                apartment_name=apt.name,
                total_units=total_units,
                occupied_units=occupied,
                vacant_units=vacant,
                total_invoices=total_invoices,
                total_due_amount=due_amount,
                total_paid_amount=paid_amount,
            )
        )
    
    return DashboardResponse(
        apartments=items,
        overall_due_amount=overall_due,
        overall_paid_amount=overall_paid,
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)