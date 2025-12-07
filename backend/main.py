from datetime import datetime, timedelta
import hashlib
import hmac
import secrets
from typing import Dict

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

SECRET_KEY = "TEMP_SECRET"  # TODO: move to env variable in future

OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5


# ---------- Pydantic models for API ----------

class SendOtpRequest(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v):
        import re
        if not re.fullmatch(r"^[6-9]\d{9}$", v):
            raise ValueError("Invalid Indian mobile number.")
        return v


class SendOtpResponse(BaseModel):
    request_id: str
    message: str


class VerifyOtpRequest(BaseModel):
    request_id: str
    mobile: str
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v):
        if not v.isdigit() or len(v) != 4:
            raise ValueError("OTP must be 4 digits.")
        return v


class VerifyOtpResponse(BaseModel):
    success: bool
    message: str


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


# Create DB tables on startup
@app.on_event("startup")
def on_startup():
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

    # ---- NEW: create or update User in DB ----
    user = db.query(models.User).filter(models.User.mobile == data.mobile).first()

    if user is None:
        # New user — first time logging in
        user = models.User(
            mobile=data.mobile,
            is_active=True,
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
    else:
        # Existing user — update last_login_at and ensure active
        user.is_active = True
        user.last_login_at = datetime.utcnow()

    db.commit()

    return VerifyOtpResponse(
        success=True,
        message="OTP verified and user logged in."
    )
