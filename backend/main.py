from datetime import datetime, timedelta
import hashlib
import hmac
import secrets
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from sqlalchemy.orm import Session

from db import Base, engine, get_db
import models

# ---------- OTP in-memory store ----------

class OtpRecord(BaseModel):
    request_id: str
    mobile: str
    otp_hash: str
    created_at: datetime
    expires_at: datetime
    attempts: int = 0
    status: str = "pending"  # pending | verified | expired


otp_store: Dict[str, OtpRecord] = {}

SECRET_KEY = "TEMP_SECRET"  # TODO: move to env later

OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5

MOBILE_REGEX = r"^[6-9]\d{9}$"


# ---------- Pydantic models for Auth ----------

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


# ---------- Pydantic models for Apartments ----------

class ApartmentCreateRequest(BaseModel):
    mobile: str  # who is creating this apartment
    name: str
    city: str
    total_units: int

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

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


# ---------- Pydantic models for Units ----------

class UnitCreateRequest(BaseModel):
    mobile: str  # user who owns the apartment
    name: str    # e.g., "101", "A-203"
    bhk_type: str  # "2BHK" / "3BHK"
    status: str    # "vacant" / "occupied"

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

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


# ---------- Pydantic models for Occupants ----------

class OccupantCreateRequest(BaseModel):
    mobile: str  # owner (user) mobile to validate permissions
    name: str
    phone: str
    role: str  # "owner" or "tenant"

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

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


# ---------- Pydantic models for Maintenance / Invoices ----------

class InvoiceCreateRequest(BaseModel):
    mobile: str   # owner mobile for validation
    period_label: str  # e.g. "Jan 2025"
    amount: int
    due_date: str       # e.g. "2025-01-15"

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

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
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v


# ---------- Helper functions ----------

def generate_otp() -> str:
    return f"{secrets.randbelow(10000):04d}"  # 0000–9999


def hash_otp(mobile: str, request_id: str, otp: str) -> str:
    msg = f"{mobile}{request_id}{otp}".encode()
    return hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def cleanup_expired():
    now = datetime.utcnow()
    to_delete = [
        req_id for req_id, record in otp_store.items()
        if record.expires_at < now
    ]
    for req_id in to_delete:
        del otp_store[req_id]


# ---------- FastAPI app ----------

app = FastAPI(title="OurNest Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # in prod, restrict this
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ournest-backend"}


# ---------- Auth / OTP endpoints ----------

@app.post("/auth/send-otp", response_model=SendOtpResponse)
def send_otp(data: SendOtpRequest):
    cleanup_expired()

    request_id = secrets.token_hex(8)
    otp = generate_otp()
    otp_hash = hash_otp(data.mobile, request_id, otp)

    record = OtpRecord(
        request_id=request_id,
        mobile=data.mobile,
        otp_hash=otp_hash,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
    )

    otp_store[request_id] = record

    print(f"[DEV] OTP for {data.mobile}: {otp} (request_id={request_id})")

    return SendOtpResponse(
        request_id=request_id,
        message="OTP sent successfully.",
    )


@app.post("/auth/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(data: VerifyOtpRequest, db: Session = Depends(get_db)):
    cleanup_expired()

    record = otp_store.get(data.request_id)

    if not record:
        raise HTTPException(status_code=400, detail="Invalid request ID.")

    if record.mobile != data.mobile:
        raise HTTPException(status_code=400, detail="Mobile number mismatch.")

    if record.expires_at < datetime.utcnow():
        record.status = "expired"
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Maximum attempts exceeded. Please request a new OTP.")

    record.attempts += 1

    expected_hash = record.otp_hash
    received_hash = hash_otp(data.mobile, data.request_id, data.otp)

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")

    record.status = "verified"

    # Create or update user record
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()

    if user is None:
        user = models.User(
            mobile=data.mobile,
            is_active=True,
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
    else:
        user.is_active = True
        user.last_login_at = datetime.utcnow()

    db.commit()

    return VerifyOtpResponse(
        success=True,
        message="OTP verified and user logged in."
    )


# ---------- Apartment endpoints ----------

@app.post("/apartments", response_model=ApartmentResponse)
def create_apartment(data: ApartmentCreateRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

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
def list_apartments(mobile: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

    apartments = (
        db.query(models.Apartment)
        .filter(models.Apartment.created_by_user_id == user.id)
        .all()
    )

    return ApartmentListResponse(apartments=apartments)


# ---------- Unit endpoints ----------

@app.post("/apartments/{apartment_id}/units", response_model=UnitResponse)
def create_unit(
    apartment_id: int,
    data: UnitCreateRequest,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

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


@app.get("/apartments/{apartment_id}/units", response_model=UnitListResponse)
def list_units(
    apartment_id: int,
    mobile: str,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

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

    units = (
        db.query(models.Unit)
        .filter(models.Unit.apartment_id == apartment.id)
        .all()
    )

    return UnitListResponse(units=units)


# ---------- Occupant endpoints ----------

@app.post("/units/{unit_id}/occupants", response_model=OccupantResponse)
def create_occupant(
    unit_id: int,
    data: OccupantCreateRequest,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

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
        raise HTTPException(
            status_code=404,
            detail="Unit not found for this user.",
        )

    occupant = models.Occupant(
        unit_id=unit.id,
        name=data.name.strip(),
        phone=data.phone.strip(),
        role=data.role.lower(),
        is_active=True,
    )
    db.add(occupant)

    # If an active occupant is added, mark unit as occupied
    unit.status = "occupied"

    db.commit()
    db.refresh(occupant)

    return occupant


@app.get("/units/{unit_id}/occupants", response_model=OccupantListResponse)
def list_occupants(
    unit_id: int,
    mobile: str,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

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
        raise HTTPException(
            status_code=404,
            detail="Unit not found for this user.",
        )

    occupants = (
        db.query(models.Occupant)
        .filter(models.Occupant.unit_id == unit.id)
        .order_by(models.Occupant.created_at.desc())
        .all()
    )

    return OccupantListResponse(occupants=occupants)


# ---------- Maintenance / Invoice endpoints ----------

@app.post("/units/{unit_id}/invoices", response_model=InvoiceResponse)
def create_invoice(
    unit_id: int,
    data: InvoiceCreateRequest,
    db: Session = Depends(get_db),
):
    # Validate user
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

    # Ensure unit belongs to this user's apartment
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
        raise HTTPException(
            status_code=404,
            detail="Unit not found for this user.",
        )

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
    mobile: str,
    db: Session = Depends(get_db),
):
    # Validate user
    user = db.query(models.User).filter(models.User.mobile == mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

    # Ensure unit belongs to user's apartment
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
        raise HTTPException(
            status_code=404,
            detail="Unit not found for this user.",
        )

    invoices = (
        db.query(models.MaintenanceInvoice)
        .filter(models.MaintenanceInvoice.unit_id == unit.id)
        .order_by(models.MaintenanceInvoice.created_at.desc())
        .all()
    )

    return InvoiceListResponse(invoices=invoices)


@app.post("/invoices/{invoice_id}/mark-paid", response_model=InvoiceResponse)
def mark_invoice_paid(
    invoice_id: int,
    data: MarkInvoicePaidRequest,
    db: Session = Depends(get_db),
):
    # Validate user
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

    # Load invoice + check that its unit belongs to this user's apartment
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
        raise HTTPException(
            status_code=404,
            detail="Invoice not found for this user.",
        )

    invoice.status = "paid"
    invoice.paid_at = datetime.utcnow()

    db.commit()
    db.refresh(invoice)

    return invoice
