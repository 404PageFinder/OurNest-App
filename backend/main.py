from datetime import datetime, timedelta
import hashlib
import hmac
import secrets
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# In-memory OTP store (temporary)
class OtpRecord(BaseModel):
    request_id: str
    mobile: str
    otp_hash: str
    created_at: datetime
    expires_at: datetime
    attempts: int = 0
    status: str = "pending"

otp_store: Dict[str, OtpRecord] = {}
SECRET_KEY = "TEMP_SECRET"  # change later

OTP_TTL = 5  # minutes
MAX_ATTEMPTS = 5

app = FastAPI()

# CORS allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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


class VerifyOtpResponse(BaseModel):
    success: bool
    message: str


def generate_otp():
    return f"{secrets.randbelow(10000):04d}"


def hash_otp(mobile, request_id, otp):
    msg = f"{mobile}{request_id}{otp}".encode()
    return hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


@app.post("/auth/send-otp", response_model=SendOtpResponse)
def send_otp(data: SendOtpRequest):
    request_id = secrets.token_hex(8)
    otp = generate_otp()
    otp_hash = hash_otp(data.mobile, request_id, otp)

    record = OtpRecord(
        request_id=request_id,
        mobile=data.mobile,
        otp_hash=otp_hash,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL),
    )
    otp_store[request_id] = record

    print(f"[DEV] OTP for {data.mobile}: {otp}")

    return SendOtpResponse(
        request_id=request_id,
        message="OTP sent successfully."
    )


@app.post("/auth/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(data: VerifyOtpRequest):
    record = otp_store.get(data.request_id)

    if not record:
        raise HTTPException(400, "Invalid request ID.")

    if record.mobile != data.mobile:
        raise HTTPException(400, "Mobile number mismatch.")

    if record.expires_at < datetime.utcnow():
        raise HTTPException(400, "OTP expired.")

    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(400, "Max attempts exceeded.")

    record.attempts += 1

    if hash_otp(data.mobile, data.request_id, data.otp) != record.otp_hash:
        raise HTTPException(400, "Incorrect OTP. Try again.")

    return VerifyOtpResponse(success=True, message="OTP Verified!")
