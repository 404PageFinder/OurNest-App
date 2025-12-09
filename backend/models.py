from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    func,
    ForeignKey,
)
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

    # Example: "101", "A-203", "G1"
    name = Column(String(50), nullable=False)

    # Example: "2BHK", "3BHK"
    bhk_type = Column(String(10), nullable=False)

    # "vacant" or "occupied"
    status = Column(String(20), nullable=False, default="vacant")

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Occupant(Base):
    __tablename__ = "occupants"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)

    # "owner" or "tenant"
    role = Column(String(20), nullable=False)

    name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class MaintenanceInvoice(Base):
    """
    Simple maintenance/invoice record for each unit.
    Example:
      period_label: "Jan 2025" or "2025-01"
      status: "due" | "paid" | "overdue" (we'll use "due"/"paid" for now)
    """

    __tablename__ = "maintenance_invoices"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)

    period_label = Column(String(32), nullable=False)  # e.g. "Jan 2025"
    amount = Column(Integer, nullable=False)
    due_date = Column(String(20), nullable=False)      # store as text "2025-01-15"

    status = Column(String(20), nullable=False, default="due")  # "due" / "paid" / "overdue"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
