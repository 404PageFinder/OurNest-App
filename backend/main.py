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

SECRET_KEY = "TEMP_SECRET"  # TODO: move to env variable later

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


# ---------- Apartment Pydantic models ----------

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


# ---------- Unit Pydantic models ----------

VALID_BHK_TYPES = {"1BHK", "2BHK", "3BHK", "4BHK"}
VALID_UNIT_STATUS = {"vacant", "occupied"}


class UnitCreateRequest(BaseModel):
    mobile: str  # who is creating this unit (must own the apartment)
    unit_number: str
    bhk_type: str
    status: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(MOBILE_REGEX, v):
            raise ValueError("Invalid Indian mobile number.")
        return v

    @field_validator("unit_number")
    @classmethod
    def validate_unit_number(cls, v):
        v = v.strip()
        if len(v) == 0:
            raise ValueError("Unit number cannot be empty.")
        return v

    @field_validator("bhk_type")
    @classmethod
    def validate_bhk_type(cls, v):
        v = v.strip().upper()
        if v not in VALID_BHK_TYPES:
            raise ValueError(f"bhk_type must be one of: {', '.join(sorted(VALID_BHK_TYPES))}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        v = v.strip().lower()
        if v not in VALID_UNIT_STATUS:
            raise ValueError("status must be 'vacant' or 'occupied'.")
        return v


class UnitResponse(BaseModel):
    id: int
    unit_number: str
    bhk_type: str
    status: str

    class Config:
        from_attributes = True


class UnitListResponse(BaseModel):
    units: List[UnitResponse]


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
    # Create all tables
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ournest-backend"}


# ---------- OTP endpoints ----------

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

    # In real app, send via SMS provider. For now, print it.
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

    # ---- Create or update User in DB ----
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
    """
    Create a new apartment for the given mobile (user).
    """
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
    """
    List all apartments created by this mobile number.
    """
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
    """
    Create a unit/flat under a given apartment, only if the apartment belongs
    to the user identified by mobile.
    """
    # Find user
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found for this mobile.")

    # Ensure apartment belongs to this user
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

    # Optional: avoid duplicate unit numbers within same apartment
    existing = (
        db.query(models.Unit)
        .filter(
            models.Unit.apartment_id == apartment_id,
            models.Unit.unit_number == data.unit_number.strip(),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A unit with this number already exists in this apartment.",
        )

    unit = models.Unit(
        apartment_id=apartment_id,
        unit_number=data.unit_number.strip(),
        bhk_type=data.bhk_type,   # already validated + upper-cased
        status=data.status,       # already validated + lower-cased
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
    """
    List all units under an apartment for the given mobile.
    """
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
        .filter(models.Unit.apartment_id == apartment_id)
        .all()
    )

    return UnitListResponse(units=units)
