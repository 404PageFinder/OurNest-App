from sqlalchemy import Column, Integer, String, DateTime, Boolean, func, ForeignKey
from db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    mobile = Column(String(15), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    is_active = Column(Boolean, default=True)


class Apartment(Base):
    __tablename__ = "apartments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    city = Column(String(255), nullable=False)
    total_units = Column(Integer, nullable=False)

    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    apartment_id = Column(Integer, ForeignKey("apartments.id"), nullable=False)

    # e.g. "101", "A-203"
    unit_number = Column(String(50), nullable=False)

    # e.g. "2BHK", "3BHK"
    bhk_type = Column(String(10), nullable=False)

    # "vacant" or "occupied"
    status = Column(String(20), nullable=False, default="vacant")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
