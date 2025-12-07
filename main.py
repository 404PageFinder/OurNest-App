from datetime import datetime, timedelta
import hashlib
import hmac
import secrets
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# ---------- Simple in-memory store (for learning / dev only) ----------

class OtpRecord(BaseModel):
    request_id: str
    mobile: str
    otp_hash: str
    created_at: datetime
    expires_at: datetime
    attempt_count: int = 0
    status: str = "pending"  # pending | verified | expired


otp_store: Dict[str, OtpRecord] = {}
mobile_rate_limit: Dict[str, int] = {}  # very simple rate limit (per hour)

# In a real system, SECRET_KEY should come from environment variable
SECRET_KEY = "CHANGE_ME_TO_A_STRONG_SECRET"

OTP_TTL_MINUTES = 5
MAX_ATTEMPTS_PER_OTP = 5

# ---------- Pydantic models (request/response) ----------

class SendOtpRequest(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        import re
        # strict India mobile validation: 10 digits, starts 6-9
        if not re.fullmatch(r"^[6-9]\d{9}$", v):
            raise ValueError("Please enter a valid 10-digit Indian mobile number.")
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
    def validate_otp(cls, v: str) -> str:
        if not v.isdigit() or len(v) != 4:
            raise ValueError("OTP must be a 4-digit numeric code.")
        return v


class VerifyOtpResponse(BaseModel):
    success: bool
    message: str


# ---------- Helper functions ----------

def hash_otp(mobile: str, request_id: str, otp: str) -> str:
    """HMAC-SHA256 of (mobile || request_id || otp)."""
    msg = f"{mobile}{request_id}{otp}".encode("utf-8")
    key = SECRET_KEY.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def generate_otp() -> str:
    """Return a random 4-digit numeric OTP as string."""
    return f"{secrets.randbelow(10000):04d}"  # 0000–9999


def cleanup_expired():
    now = datetime.utcnow()
    to_delete = [
        req_id for req_id, record in otp_store.items() if record.expires_at < now
    ]
    for req_id in to_delete:
        del otp_store[req_id]


# ---------- FastAPI app ----------

app = FastAPI(title="OurNest Auth API")

# CORS so frontend (http://localhost:5173) can call backend (http://localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in prod, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/auth/send-otp", response_model=SendOtpResponse, status_code=201)
def send_otp(payload: SendOtpRequest):
    cleanup_expired()

    mobile = payload.mobile

    # Very simple rate limit: max 3 active OTPs per mobile in memory
    count_for_mobile = sum(1 for r in otp_store.values() if r.mobile == mobile)
    if count_for_mobile >= 3:
        raise HTTPException(
            status_code=429,
            detail="You have reached the max OTP attempts. Try after some time.",
        )

    request_id = secrets.token_hex(8)
    otp = generate_otp()
    otp_hash = hash_otp(mobile, request_id, otp)

    record = OtpRecord(
        request_id=request_id,
        mobile=mobile,
        otp_hash=otp_hash,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
    )
    otp_store[request_id] = record

    # For now, we "fake" SMS sending by printing OTP to the console.
    # In real app, integrate SMS provider here.
    print(f"[DEV ONLY] OTP for {mobile} (request {request_id}) is: {otp}")

    return SendOtpResponse(
        request_id=request_id,
        message="Verification code has been sent to your phone.",
    )


@app.post("/auth/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(payload: VerifyOtpRequest):
    cleanup_expired()

    record = otp_store.get(payload.request_id)
    if not record or record.mobile != payload.mobile:
        raise HTTPException(status_code=400, detail="Invalid request or mobile number.")

    if record.expires_at < datetime.utcnow():
        record.status = "expired"
        raise HTTPException(status_code=400, detail="OTP expired. Tap Resend to get a new code.")

    if record.status == "verified":
        raise HTTPException(status_code=400, detail="This code was already used.")

    if record.attempt_count >= MAX_ATTEMPTS_PER_OTP:
        raise HTTPException(
            status_code=400,
            detail="Maximum attempts exceeded. Request a new code.",
        )

    record.attempt_count += 1

    expected_hash = record.otp_hash
    received_hash = hash_otp(payload.mobile, payload.request_id, payload.otp)

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=400, detail="Wrong code — please try again.")

    record.status = "verified"
    return VerifyOtpResponse(success=True, message="OTP verified successfully.")
