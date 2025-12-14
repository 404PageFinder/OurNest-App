import { useState, useEffect } from "react";
import "./App.css";

// Use environment variable for API URL, fallback to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
        const res = await fetch(`${API_BASE_URL}/health`);
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
      const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
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
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
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
      setAptMessage("OTP verified! Let's onboard your apartment.");
      fetchApartments();
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const fetchApartments = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/apartments?mobile=${mobile}`
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
        `${API_BASE_URL}/dashboard?mobile=${mobile}`
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
      // FIXED: Mobile in body, not query param
      const res = await fetch(`${API_BASE_URL}/apartments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile,  // ← Mobile in body!
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
        `${API_BASE_URL}/apartments/${apartmentId}/units?mobile=${mobile}`
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
      // FIXED: Mobile in body, not query param
      const res = await fetch(
        `${API_BASE_URL}/apartments/${selectedApartmentId}/units`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,  // ← Mobile in body!
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
        `${API_BASE_URL}/units/${unitId}/occupants?mobile=${mobile}`
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
      // FIXED: Mobile in body, not query param
      const res = await fetch(
        `${API_BASE_URL}/units/${selectedUnitId}/occupants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,  // ← Mobile in body!
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
      let url = `${API_BASE_URL}/units/${unitId}/invoices?mobile=${mobile}`;
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
      // FIXED: Mobile in body, not query param
      const res = await fetch(
        `${API_BASE_URL}/units/${selectedUnitId}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,  // ← Mobile in body!
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

  const markPaid = async (invoiceId) => {
    setError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/invoices/${invoiceId}/mark-paid`,
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

      setInvMessage(`Invoice marked as paid!`);
      fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      fetchDashboard();
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  // UI render starts here
  return (
    <div className="app">
      <header className="app-header">
        <h1>🏘️ OurNest</h1>
        <p className="tagline">Apartment Management System</p>
        <div className="backend-status">
          Backend:{" "}
          <span className={backendStatus === "online" ? "online" : "offline"}>
            {backendStatus}
          </span>
        </div>
      </header>

      <main className="app-main">
        {/* STEP: MOBILE */}
        {step === "mobile" && (
          <div className="card">
            <h2>Login with OTP</h2>
            <p>Enter your mobile number to receive an OTP</p>
            <div className="form-group">
              <label>Mobile Number</label>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10-digit mobile"
                maxLength={10}
              />
            </div>
            <button
              onClick={sendOtp}
              disabled={!isValidMobile}
              className="btn-primary"
            >
              Send OTP
            </button>
            {error && <div className="error">{error}</div>}
          </div>
        )}

        {/* STEP: OTP */}
        {step === "otp" && (
          <div className="card">
            <h2>Verify OTP</h2>
            <p>Enter the 4-digit OTP sent to {mobile}</p>
            <div className="form-group">
              <label>OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="4-digit OTP"
                maxLength={4}
              />
            </div>
            <div className="button-group">
              <button onClick={verifyOtp} className="btn-primary">
                Verify OTP
              </button>
              <button
                onClick={() => {
                  setStep("mobile");
                  setOtp("");
                  setError("");
                }}
                className="btn-secondary"
              >
                Back
              </button>
            </div>
            {error && <div className="error">{error}</div>}
          </div>
        )}

        {/* STEP: APARTMENT */}
        {step === "apartment" && (
          <>
            {/* Apartment Form */}
            <section className="card">
              <h2>Create Apartment</h2>
              {aptMessage && <div className="success">{aptMessage}</div>}
              {error && <div className="error">{error}</div>}
              
              <div className="form-group">
                <label>Apartment Name</label>
                <input
                  type="text"
                  value={aptName}
                  onChange={(e) => setAptName(e.target.value)}
                  placeholder="e.g. Sunrise Towers"
                />
              </div>
              
              <div className="form-group">
                <label>City</label>
                <input
                  type="text"
                  value={aptCity}
                  onChange={(e) => setAptCity(e.target.value)}
                  placeholder="e.g. Bangalore"
                />
              </div>
              
              <div className="form-group">
                <label>Total Units</label>
                <input
                  type="number"
                  value={aptUnits}
                  onChange={(e) => setAptUnits(e.target.value)}
                  placeholder="e.g. 50"
                  min="1"
                />
              </div>
              
              <button onClick={createApartment} className="btn-primary">
                Create Apartment
              </button>
            </section>

            {/* Apartments List */}
            <section className="card">
              <h2>Your Apartments</h2>
              {createdApartments.length === 0 ? (
                <p className="empty-state">No apartments yet. Create one above!</p>
              ) : (
                <div className="list">
                  {createdApartments.map((apt) => (
                    <div
                      key={apt.id}
                      className={`list-item ${
                        selectedApartmentId === apt.id ? "selected" : ""
                      }`}
                      onClick={() => handleSelectApartment(apt)}
                    >
                      <div className="list-item-title">{apt.name}</div>
                      <div className="list-item-meta">
                        {apt.city} • {apt.total_units} units
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Units Section */}
            {selectedApartmentId && (
              <>
                <section className="card">
                  <h2>Units in {selectedApartmentName}</h2>
                  {unitMessage && <div className="success">{unitMessage}</div>}
                  
                  <div className="form-group">
                    <label>Unit Name</label>
                    <input
                      type="text"
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      placeholder="e.g. A-101"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>BHK Type</label>
                    <select
                      value={unitBhk}
                      onChange={(e) => setUnitBhk(e.target.value)}
                    >
                      <option value="1BHK">1BHK</option>
                      <option value="2BHK">2BHK</option>
                      <option value="3BHK">3BHK</option>
                      <option value="4BHK">4BHK</option>
                      <option value="5BHK">5BHK</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={unitStatus}
                      onChange={(e) => setUnitStatus(e.target.value)}
                    >
                      <option value="vacant">Vacant</option>
                      <option value="occupied">Occupied</option>
                    </select>
                  </div>
                  
                  <button onClick={createUnit} className="btn-primary">
                    Add Unit
                  </button>
                </section>

                <section className="card">
                  <h3>Units List</h3>
                  {units.length === 0 ? (
                    <p className="empty-state">No units yet. Add one above!</p>
                  ) : (
                    <div className="list">
                      {units.map((u) => (
                        <div
                          key={u.id}
                          className={`list-item ${
                            selectedUnitId === u.id ? "selected" : ""
                          }`}
                          onClick={() => handleSelectUnit(u)}
                        >
                          <div className="list-item-title">{u.name}</div>
                          <div className="list-item-meta">
                            {u.bhk_type} • {u.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Occupants Section */}
            {selectedUnitId && (
              <>
                <section className="card">
                  <h2>Occupants for {selectedUnitLabel}</h2>
                  {occMessage && <div className="success">{occMessage}</div>}
                  
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={occName}
                      onChange={(e) => setOccName(e.target.value)}
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={occPhone}
                      onChange={(e) => setOccPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      value={occRole}
                      onChange={(e) => setOccRole(e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="tenant">Tenant</option>
                      <option value="family">Family</option>
                    </select>
                  </div>
                  
                  <button onClick={createOccupant} className="btn-primary">
                    Add Occupant
                  </button>
                </section>

                <section className="card">
                  <h3>Occupants List</h3>
                  {occupants.length === 0 ? (
                    <p className="empty-state">No occupants yet. Add one above!</p>
                  ) : (
                    <div className="list">
                      {occupants.map((occ) => (
                        <div key={occ.id} className="list-item">
                          <div className="list-item-title">{occ.name}</div>
                          <div className="list-item-meta">
                            {occ.phone} • {occ.role} • {occ.is_active ? "Active" : "Inactive"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Invoices Section */}
                <section className="card">
                  <h2>Invoices for {selectedUnitLabel}</h2>
                  {invMessage && <div className="success">{invMessage}</div>}
                  
                  <div className="form-group">
                    <label>Period Label</label>
                    <input
                      type="text"
                      value={invPeriod}
                      onChange={(e) => setInvPeriod(e.target.value)}
                      placeholder="e.g. January 2024"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Amount (₹)</label>
                    <input
                      type="number"
                      value={invAmount}
                      onChange={(e) => setInvAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      min="0"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={invDueDate}
                      onChange={(e) => setInvDueDate(e.target.value)}
                    />
                  </div>
                  
                  <button onClick={createInvoice} className="btn-primary">
                    Create Invoice
                  </button>
                </section>

                <section className="card">
                  <h3>Invoices List</h3>
                  
                  <div className="form-group">
                    <label>Filter by Month (YYYY-MM)</label>
                    <input
                      type="text"
                      value={invFilterMonth}
                      onChange={(e) => {
                        setInvFilterMonth(e.target.value);
                        if (selectedUnitId) {
                          fetchInvoices(selectedUnitId, e.target.value || undefined);
                        }
                      }}
                      placeholder="e.g. 2024-01"
                    />
                  </div>
                  
                  {invoices.length === 0 ? (
                    <p className="empty-state">No invoices yet. Create one above!</p>
                  ) : (
                    <div className="list">
                      {invoices.map((inv) => (
                        <div key={inv.id} className="list-item invoice-item">
                          <div className="list-item-title">
                            {inv.period_label}
                          </div>
                          <div className="list-item-meta">
                            ₹{inv.amount} • Due: {inv.due_date} • 
                            <span className={`status-${inv.status}`}>
                              {inv.status}
                            </span>
                          </div>
                          {inv.status !== "paid" && (
                            <button
                              onClick={() => markPaid(inv.id)}
                              className="btn-small"
                            >
                              Mark as Paid
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Dashboard Section */}
            <section className="card dashboard">
              <h2>📊 Dashboard</h2>
              {dashboard ? (
                <>
                  <div className="dashboard-summary">
                    <div className="summary-card">
                      <div className="summary-title">Total Due</div>
                      <div className="summary-value due">
                        ₹{dashboard.overall_due_amount}
                      </div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-title">Total Paid</div>
                      <div className="summary-value paid">
                        ₹{dashboard.overall_paid_amount}
                      </div>
                    </div>
                  </div>

                  {dashboard.apartments && dashboard.apartments.length > 0 && (
                    <div className="apartment-stats">
                      <h3>Apartment Statistics</h3>
                      {dashboard.apartments.map((apt) => (
                        <div key={apt.apartment_id} className="stat-card">
                          <h4>{apt.apartment_name}</h4>
                          <div className="stat-grid">
                            <div className="stat-item">
                              <span className="stat-label">Total Units:</span>
                              <span className="stat-value">{apt.total_units}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">Occupied:</span>
                              <span className="stat-value">{apt.occupied_units}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">Vacant:</span>
                              <span className="stat-value">{apt.vacant_units}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">Invoices:</span>
                              <span className="stat-value">{apt.total_invoices}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">Due Amount:</span>
                              <span className="stat-value due">₹{apt.total_due_amount}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-label">Paid Amount:</span>
                              <span className="stat-value paid">₹{apt.total_paid_amount}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="empty-state">Loading dashboard...</p>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>OurNest • Apartment Management Made Easy</p>
        {mobile && <p className="user-info">Logged in as: {mobile}</p>}
      </footer>
    </div>
  );
}