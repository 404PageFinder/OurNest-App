from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    func,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
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
    is_active = Column(Boolean, default=True, index=True)

    # Relationships
    apartments = relationship("Apartment", back_populates="creator", lazy="select")


class Apartment(Base):
    __tablename__ = "apartments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    city = Column(String(255), nullable=False, index=True)
    total_units = Column(Integer, nullable=False)

    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    creator = relationship("User", back_populates="apartments")
    units = relationship("Unit", back_populates="apartment", lazy="select", cascade="all, delete-orphan")

    # Add composite index for common queries
    __table_args__ = (
        Index('idx_apartment_user_name', 'created_by_user_id', 'name'),
    )


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    apartment_id = Column(Integer, ForeignKey("apartments.id"), nullable=False, index=True)

    # Example: "101", "A-203", "G1"
    name = Column(String(50), nullable=False, index=True)

    # Example: "2BHK", "3BHK"
    bhk_type = Column(String(10), nullable=False, index=True)

    # "vacant" or "occupied"
    status = Column(String(20), nullable=False, default="vacant", index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    apartment = relationship("Apartment", back_populates="units")
    occupants = relationship("Occupant", back_populates="unit", lazy="select", cascade="all, delete-orphan")
    invoices = relationship("MaintenanceInvoice", back_populates="unit", lazy="select", cascade="all, delete-orphan")

    # Add composite indexes for common queries
    __table_args__ = (
        Index('idx_unit_apartment_status', 'apartment_id', 'status'),
        Index('idx_unit_apartment_name', 'apartment_id', 'name'),
    )


class Occupant(Base):
    __tablename__ = "occupants"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False, index=True)

    # "owner" or "tenant"
    role = Column(String(20), nullable=False, index=True)

    name = Column(String(255), nullable=False, index=True)
    phone = Column(String(20), nullable=False)

    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    unit = relationship("Unit", back_populates="occupants")

    # Add composite index for filtering active occupants
    __table_args__ = (
        Index('idx_occupant_unit_active', 'unit_id', 'is_active'),
    )


class MaintenanceInvoice(Base):
    """
    Simple maintenance/invoice record for each unit.
    Example:
      period_label: "Jan 2025" or "2025-01"
      status: "due" | "paid" | "overdue"
    """

    __tablename__ = "maintenance_invoices"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False, index=True)

    period_label = Column(String(32), nullable=False, index=True)  # e.g. "Jan 2025"
    amount = Column(Integer, nullable=False)
    due_date = Column(String(20), nullable=False, index=True)      # store as text "2025-01-15"

    status = Column(String(20), nullable=False, default="due", index=True)  # "due" / "paid" / "overdue"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    unit = relationship("Unit", back_populates="invoices")

    # Add composite indexes for common queries
    __table_args__ = (
        Index('idx_invoice_unit_status', 'unit_id', 'status'),
        Index('idx_invoice_unit_date', 'unit_id', 'due_date'),
        Index('idx_invoice_status_date', 'status', 'due_date'),
    )