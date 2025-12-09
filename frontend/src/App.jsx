import { useState, useEffect } from "react";
import "./App.css";

export default function App() {
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("mobile"); // "mobile" | "otp" | "apartment"
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking...");

  // Apartment form + list
  const [aptName, setAptName] = useState("");
  const [aptCity, setAptCity] = useState("");
  const [aptUnits, setAptUnits] = useState("");
  const [aptMessage, setAptMessage] = useState("");
  const [createdApartments, setCreatedApartments] = useState([]);

  // Selected apartment for Units
  const [selectedApartmentId, setSelectedApartmentId] = useState(null);
  const [selectedApartmentName, setSelectedApartmentName] = useState("");

  // Units
  const [units, setUnits] = useState([]);
  const [unitName, setUnitName] = useState("");
  const [unitBhk, setUnitBhk] = useState("2BHK");
  const [unitStatus, setUnitStatus] = useState("vacant");
  const [unitMessage, setUnitMessage] = useState("");

  // Selected unit for occupants / invoices
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedUnitLabel, setSelectedUnitLabel] = useState("");

  // Occupants
  const [occupants, setOccupants] = useState([]);
  const [occName, setOccName] = useState("");
  const [occPhone, setOccPhone] = useState("");
  const [occRole, setOccRole] = useState("owner");
  const [occMessage, setOccMessage] = useState("");

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [invPeriod, setInvPeriod] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invDueDate, setInvDueDate] = useState("");
  const [invMessage, setInvMessage] = useState("");
  const [invFilterMonth, setInvFilterMonth] = useState(""); // YYYY-MM

  // Dashboard
  const [dashboard, setDashboard] = useState(null);

  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  // Check backend on load
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch("http://localhost:8000/health");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.status === "ok") {
          setBackendStatus("online");
        } else {
          setBackendStatus("offline");
        }
      } catch {
        setBackendStatus("offline");
      }
    };

    checkBackend();
  }, []);

  const sendOtp = async () => {
    if (!isValidMobile) {
      setError("Invalid mobile number");
      return;
    }
    setError("");

    try {
      const res = await fetch("http://localhost:8000/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Failed to send OTP");
        return;
      }

      setRequestId(data.request_id);
      setStep("otp");
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const verifyOtp = async () => {
    setError("");
    try {
      const res = await fetch("http://localhost:8000/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, mobile, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "OTP verification failed");
        return;
      }

      setStep("apartment");
      setAptMessage("OTP verified! Let’s onboard your apartment.");
      fetchApartments();
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const fetchApartments = async () => {
    try {
      const res = await fetch(
        `http://localhost:8000/apartments?mobile=${mobile}`
      );
      if (!res.ok) {
        setCreatedApartments([]);
        return;
      }
      const data = await res.json();
      setCreatedApartments(data.apartments || []);
    } catch {
      setCreatedApartments([]);
    }
  };

  const fetchDashboard = async () => {
    if (!mobile) return;
    try {
      const res = await fetch(
        `http://localhost:8000/dashboard?mobile=${mobile}`
      );
      if (!res.ok) {
        setDashboard(null);
        return;
      }
      const data = await res.json();
      setDashboard(data);
    } catch {
      setDashboard(null);
    }
  };

  const createApartment = async () => {
    setError("");
    setAptMessage("");

    const totalUnitsNum = parseInt(aptUnits, 10);

    try {
      const res = await fetch("http://localhost:8000/apartments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile,
          name: aptName,
          city: aptCity,
          total_units: totalUnitsNum,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Could not create apartment.");
        return;
      }

      setAptMessage(`Apartment "${data.name}" created successfully!`);
      setAptName("");
      setAptCity("");
      setAptUnits("");
      fetchApartments();
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const handleSelectApartment = (apt) => {
    setSelectedApartmentId(apt.id);
    setSelectedApartmentName(apt.name);
    setUnitMessage("");
    setUnits([]);
    setSelectedUnitId(null);
    setSelectedUnitLabel("");
    setOccupants([]);
    setInvoices([]);
    fetchUnits(apt.id);
  };

  const fetchUnits = async (apartmentId) => {
    try {
      const res = await fetch(
        `http://localhost:8000/apartments/${apartmentId}/units?mobile=${mobile}`
      );
      if (!res.ok) {
        setUnits([]);
        return;
      }
      const data = await res.json();
      setUnits(data.units || []);
    } catch {
      setUnits([]);
    }
  };

  const createUnit = async () => {
    if (!selectedApartmentId) {
      setUnitMessage("Please select an apartment first.");
      return;
    }
    setError("");
    setUnitMessage("");

    try {
      const res = await fetch(
        `http://localhost:8000/apartments/${selectedApartmentId}/units`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,
            name: unitName,
            bhk_type: unitBhk,
            status: unitStatus,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Could not create unit.");
        return;
      }

      setUnitMessage(`Unit "${data.name}" created successfully!`);
      setUnitName("");
      setUnitBhk("2BHK");
      setUnitStatus("vacant");
      fetchUnits(selectedApartmentId);
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const handleSelectUnit = (u) => {
    setSelectedUnitId(u.id);
    setSelectedUnitLabel(`${u.name} (${u.bhk_type}, ${u.status})`);
    setOccMessage("");
    setOccName("");
    setOccPhone("");
    setOccRole("owner");
    setInvMessage("");
    setInvPeriod("");
    setInvAmount("");
    setInvDueDate("");
    fetchOccupants(u.id);
    fetchInvoices(u.id, invFilterMonth || undefined);
  };

  const fetchOccupants = async (unitId) => {
    try {
      const res = await fetch(
        `http://localhost:8000/units/${unitId}/occupants?mobile=${mobile}`
      );
      if (!res.ok) {
        setOccupants([]);
        return;
      }
      const data = await res.json();
      setOccupants(data.occupants || []);
    } catch {
      setOccupants([]);
    }
  };

  const createOccupant = async () => {
    if (!selectedUnitId) {
      setOccMessage("Please select a unit first.");
      return;
    }
    setError("");
    setOccMessage("");

    try {
      const res = await fetch(
        `http://localhost:8000/units/${selectedUnitId}/occupants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,
            name: occName,
            phone: occPhone,
            role: occRole,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Could not create occupant.");
        return;
      }

      setOccMessage(
        `Occupant "${data.name}" (${data.role}) added successfully!`
      );
      setOccName("");
      setOccPhone("");
      setOccRole("tenant");
      fetchOccupants(selectedUnitId);

      if (selectedApartmentId) {
        fetchUnits(selectedApartmentId);
      }
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const fetchInvoices = async (unitId, month) => {
    try {
      let url = `http://localhost:8000/units/${unitId}/invoices?mobile=${mobile}`;
      if (month) {
        url += `&month=${month}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        setInvoices([]);
        return;
      }
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    }
  };

  const createInvoice = async () => {
    if (!selectedUnitId) {
      setInvMessage("Please select a unit first.");
      return;
    }
    setError("");
    setInvMessage("");

    const amountNum = parseInt(invAmount, 10);

    try {
      const res = await fetch(
        `http://localhost:8000/units/${selectedUnitId}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,
            period_label: invPeriod,
            amount: amountNum,
            due_date: invDueDate,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Could not create invoice.");
        return;
      }

      setInvMessage(
        `Invoice for "${data.period_label}" created successfully!`
      );
      setInvPeriod("");
      setInvAmount("");
      setInvDueDate("");
      fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const markInvoicePaid = async (invoiceId) => {
    setError("");
    setInvMessage("");

    try {
      const res = await fetch(
        `http://localhost:8000/invoices/${invoiceId}/mark-paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mobile }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Could not mark invoice as paid.");
        return;
      }

      setInvMessage(
        `Invoice "${data.period_label}" marked as paid.`
      );
      if (selectedUnitId) {
        fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      }
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const renderPaidPercent = (item) => {
    const total = item.total_due_amount + item.total_paid_amount;
    if (total === 0) return "0%";
    const pct = Math.round((item.total_paid_amount * 100) / total);
    return `${pct}%`;
  };

  const handleApplyInvoiceFilter = () => {
    if (!selectedUnitId) return;
    fetchInvoices(selectedUnitId, invFilterMonth || undefined);
  };

  const handleClearInvoiceFilter = () => {
    if (!selectedUnitId) return;
    setInvFilterMonth("");
    fetchInvoices(selectedUnitId);
  };

  return (
    <div className="screen">
      <div className="card">
        <h2>Get started with OurNest</h2>

        <p className="backend-status">
          Backend:{" "}
          <span
            className={
              backendStatus === "online" ? "status-ok" : "status-bad"
            }
          >
            {backendStatus}
          </span>
        </p>

        {step === "mobile" && (
          <>
            <input
              placeholder="Enter mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
            <button disabled={!isValidMobile} onClick={sendOtp}>
              Send OTP
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <p>OTP sent to +91 {mobile}</p>
            <input
              placeholder="Enter 4-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <button disabled={otp.length !== 4} onClick={verifyOtp}>
              Verify OTP
            </button>
          </>
        )}

        {step === "apartment" && (
          <>
            <p className="welcome-text">
              Welcome, +91 {mobile}. Manage apartments, units, occupants and maintenance.
            </p>

            {/* Dashboard */}
            {dashboard && (
              <div className="section">
                <h3 className="section-title">Dashboard</h3>
                <div className="dashboard-row">
                  <div className="dash-card">
                    <div className="dash-label">Total Due</div>
                    <div className="dash-value">
                      ₹{dashboard.overall_due_amount || 0}
                    </div>
                  </div>
                  <div className="dash-card">
                    <div className="dash-label">Total Paid</div>
                    <div className="dash-value">
                      ₹{dashboard.overall_paid_amount || 0}
                    </div>
                  </div>
                </div>

                {dashboard.apartments.length > 0 && (
                  <ul className="dashboard-apts">
                    {dashboard.apartments.map((apt) => (
                      <li key={apt.apartment_id} className="dashboard-apt-item">
                        <div className="dash-apt-header">
                          <strong>{apt.apartment_name}</strong>
                        </div>
                        <div className="dash-apt-row">
                          <span>
                            Units: {apt.total_units} | Occ: {apt.occupied_units} | Vac:{" "}
                            {apt.vacant_units}
                          </span>
                        </div>
                        <div className="dash-apt-row">
                          <span>Due: ₹{apt.total_due_amount}</span>
                          <span>Paid: ₹{apt.total_paid_amount}</span>
                          <span>Paid %: {renderPaidPercent(apt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Apartment creation */}
            <div className="section">
              <h3 className="section-title">Create Apartment</h3>
              <input
                placeholder="Apartment name"
                value={aptName}
                onChange={(e) => setAptName(e.target.value)}
              />
              <input
                placeholder="City"
                value={aptCity}
                onChange={(e) => setAptCity(e.target.value)}
              />
              <input
                placeholder="Total units (e.g., 40)"
                type="number"
                value={aptUnits}
                onChange={(e) => setAptUnits(e.target.value)}
              />
              <button
                onClick={createApartment}
                disabled={!aptName || !aptCity || !aptUnits}
              >
                Create Apartment
              </button>
            </div>

            {/* Apartment list & selection */}
            {createdApartments.length > 0 && (
              <div className="section">
                <h3 className="section-title">Your apartments</h3>
                <ul className="apt-list">
                  {createdApartments.map((apt) => (
                    <li
                      key={apt.id}
                      className={
                        apt.id === selectedApartmentId
                          ? "apt-item selected"
                          : "apt-item"
                      }
                      onClick={() => handleSelectApartment(apt)}
                    >
                      <strong>{apt.name}</strong> – {apt.city} (
                      {apt.total_units} units)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Units for selected apartment */}
            {selectedApartmentId && (
              <div className="section">
                <h3 className="section-title">
                  Units in: {selectedApartmentName}
                </h3>

                <div className="unit-form">
                  <input
                    placeholder="Unit number (e.g., 101)"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                  />
                  <select
                    value={unitBhk}
                    onChange={(e) => setUnitBhk(e.target.value)}
                  >
                    <option value="1BHK">1BHK</option>
                    <option value="2BHK">2BHK</option>
                    <option value="3BHK">3BHK</option>
                    <option value="4BHK">4BHK</option>
                  </select>
                  <select
                    value={unitStatus}
                    onChange={(e) => setUnitStatus(e.target.value)}
                  >
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                  </select>
                  <button onClick={createUnit} disabled={!unitName}>
                    Add Unit
                  </button>
                </div>

                {units.length > 0 && (
                  <ul className="unit-list">
                    {units.map((u) => (
                      <li
                        key={u.id}
                        className={
                          u.id === selectedUnitId
                            ? "unit-item unit-selected"
                            : "unit-item"
                        }
                        onClick={() => handleSelectUnit(u)}
                      >
                        <span className="unit-name">{u.name}</span>
                        <span className="unit-bhk">{u.bhk_type}</span>
                        <span
                          className={
                            u.status === "vacant"
                              ? "unit-status vacant"
                              : "unit-status occupied"
                          }
                        >
                          {u.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Occupants for selected unit */}
            {selectedUnitId && (
              <div className="section">
                <h3 className="section-title">
                  Occupants – unit: {selectedUnitLabel}
                </h3>

                <div className="occupant-form">
                  <input
                    placeholder="Name"
                    value={occName}
                    onChange={(e) => setOccName(e.target.value)}
                  />
                  <input
                    placeholder="Phone"
                    value={occPhone}
                    onChange={(e) => setOccPhone(e.target.value)}
                  />
                  <select
                    value={occRole}
                    onChange={(e) => setOccRole(e.target.value)}
                  >
                    <option value="owner">Owner</option>
                    <option value="tenant">Tenant</option>
                  </select>
                  <button
                    onClick={createOccupant}
                    disabled={!occName || !occPhone}
                  >
                    Add Occupant
                  </button>
                </div>

                {occupants.length > 0 && (
                  <ul className="occupant-list">
                    {occupants.map((o) => (
                      <li key={o.id} className="occupant-item">
                        <div>
                          <strong>{o.name}</strong> ({o.role})
                        </div>
                        <div className="occupant-phone">{o.phone}</div>
                        <div
                          className={
                            o.is_active
                              ? "occupant-status active"
                              : "occupant-status inactive"
                          }
                        >
                          {o.is_active ? "Active" : "Inactive"}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Maintenance / Invoices for selected unit */}
            {selectedUnitId && (
              <div className="section">
                <h3 className="section-title">
                  Maintenance & Invoices – unit: {selectedUnitLabel}
                </h3>

                {/* Filter row */}
                <div className="invoice-filter">
                  <label className="invoice-filter-label">
                    Filter by month:
                  </label>
                  <input
                    type="month"
                    value={invFilterMonth}
                    onChange={(e) => setInvFilterMonth(e.target.value)}
                  />
                  <button
                    className="btn-small"
                    onClick={handleApplyInvoiceFilter}
                  >
                    Apply
                  </button>
                  {invFilterMonth && (
                    <button
                      className="btn-ghost"
                      onClick={handleClearInvoiceFilter}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="invoice-form">
                  <input
                    placeholder='Period (e.g., "Jan 2025")'
                    value={invPeriod}
                    onChange={(e) => setInvPeriod(e.target.value)}
                  />
                  <input
                    placeholder="Amount (e.g., 2500)"
                    type="number"
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                  />
                  <input
                    placeholder="Due date (YYYY-MM-DD)"
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                  />
                  <button
                    onClick={createInvoice}
                    disabled={!invPeriod || !invAmount || !invDueDate}
                  >
                    Create Invoice
                  </button>
                </div>

                {invoices.length > 0 && (
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Amount</th>
                        <th>Due date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id}>
                          <td>{inv.period_label}</td>
                          <td>₹{inv.amount}</td>
                          <td>{inv.due_date}</td>
                          <td>
                            <span
                              className={
                                inv.status === "paid"
                                  ? "badge badge-paid"
                                  : "badge badge-due"
                              }
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td>
                            {inv.status !== "paid" && (
                              <button
                                className="btn-small"
                                onClick={() => markInvoicePaid(inv.id)}
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}

        {aptMessage && <p className="info">{aptMessage}</p>}
        {unitMessage && <p className="info">{unitMessage}</p>}
        {occMessage && <p className="info">{occMessage}</p>}
        {invMessage && <p className="info">{invMessage}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
