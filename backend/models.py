from sqlalchemy import Column, Integer, String, DateTime, Boolean, func
from db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    mobile = Column(String(15), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
