import { useState, useEffect } from "react";
import "./App.css";

// Use environment variable for API URL, fallback to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState(""); // ← ADD THIS
  const [step, setStep] = useState("mobile");
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
  const [invFilterMonth, setInvFilterMonth] = useState("");

  // Dashboard
  const [dashboard, setDashboard] = useState(null);

  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  // ← ADD: Helper to get auth headers
  const getAuthHeaders = () => {
    const headers = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return headers;
  };

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

      // ← SAVE THE TOKEN!
      setAccessToken(data.access_token);
      setStep("apartment");
      setAptMessage("OTP verified! Let's onboard your apartment.");
      
      // Wait for token to be set, then fetch
      setTimeout(() => {
        fetchApartments(data.access_token);
        fetchDashboard(data.access_token);
      }, 100);
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const fetchApartments = async (token = accessToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/apartments`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
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

  const fetchDashboard = async (token = accessToken) => {
    if (!mobile) return;
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
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
      // ← USE TOKEN IN HEADERS!
      const res = await fetch(`${API_BASE_URL}/apartments`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
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
        `${API_BASE_URL}/apartments/${apartmentId}/units`,
        {
          headers: getAuthHeaders(),
        }
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
        `${API_BASE_URL}/apartments/${selectedApartmentId}/units`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
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
        `${API_BASE_URL}/units/${unitId}/occupants`,
        {
          headers: getAuthHeaders(),
        }
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
        `${API_BASE_URL}/units/${selectedUnitId}/occupants`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
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
      let url = `${API_BASE_URL}/units/${unitId}/invoices`;
      if (month) {
        url += `?month=${month}`;
      }
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
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
        `${API_BASE_URL}/units/${selectedUnitId}/invoices`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
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
          headers: getAuthHeaders(),
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
    <div className="screen">
      <div className="app-container">
        {/* STEP: MOBILE */}
        {step === "mobile" && (
          <div className="card">
            <h2>🏘️ OurNest</h2>
            <p>Apartment Management System</p>
            <div className="backend-status">
              Backend: <span className={backendStatus === "online" ? "status-ok" : "status-bad"}>{backendStatus}</span>
            </div>
            <p className="welcome-text">Enter your mobile number to receive an OTP</p>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="10-digit mobile"
              maxLength={10}
            />
            <button
              onClick={sendOtp}
              disabled={!isValidMobile}
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
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="4-digit OTP"
              maxLength={4}
            />
            <button onClick={verifyOtp}>
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
            {error && <div className="error">{error}</div>}
          </div>
        )}

        {/* STEP: DASHBOARD */}
        {step === "apartment" && (
          <div className="dashboard-layout">
            {/* Sidebar */}
            <div className="sidebar">
              <div className="sidebar-header">
                <h2>🏘️ OurNest</h2>
              </div>

              {/* Dashboard Summary */}
              {dashboard && (
                <div className="dashboard-summary">
                  <h3>Overview</h3>
                  <div className="summary-card">
                    <div className="summary-label">Total Due</div>
                    <div className="summary-value">₹{dashboard.overall_due_amount}</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-label">Total Paid</div>
                    <div className="summary-value success">₹{dashboard.overall_paid_amount}</div>
                  </div>
                </div>
              )}

              {/* Apartments List */}
              <div>
                <h3>Your Apartments</h3>
                {createdApartments.length === 0 ? (
                  <div className="empty-state-small">No apartments yet</div>
                ) : (
                  <ul className="apt-list">
                    {createdApartments.map((apt) => (
                      <li
                        key={apt.id}
                        className={`apt-item ${selectedApartmentId === apt.id ? "selected" : ""}`}
                        onClick={() => handleSelectApartment(apt)}
                      >
                        <strong>{apt.name}</strong>
                        <div className="apt-meta">{apt.city} • {apt.total_units} units</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
              {/* Create Apartment */}
              <div className="section">
                <h2>Create New Apartment</h2>
                {aptMessage && <div className="success">{aptMessage}</div>}
                {error && <div className="error">{error}</div>}
                <div className="form-horizontal">
                  <input
                    type="text"
                    value={aptName}
                    onChange={(e) => setAptName(e.target.value)}
                    placeholder="Apartment name"
                  />
                  <input
                    type="text"
                    value={aptCity}
                    onChange={(e) => setAptCity(e.target.value)}
                    placeholder="City"
                  />
                  <input
                    type="number"
                    value={aptUnits}
                    onChange={(e) => setAptUnits(e.target.value)}
                    placeholder="Total units"
                    min="1"
                  />
                  <button onClick={createApartment}>Create Apartment</button>
                </div>
              </div>

              {/* Units Section */}
              {selectedApartmentId && (
                <div className="section">
                  <h2>Units in {selectedApartmentName}</h2>
                  {unitMessage && <div className="success">{unitMessage}</div>}
                  <div className="form-horizontal">
                    <input
                      type="text"
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      placeholder="Unit name (e.g. A-101)"
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
                    <button onClick={createUnit}>Add Unit</button>
                  </div>

                  {units.length > 0 && (
                    <div className="units-grid">
                      {units.map((u) => (
                        <div
                          key={u.id}
                          className={`unit-card ${selectedUnitId === u.id ? "selected" : ""}`}
                          onClick={() => handleSelectUnit(u)}
                        >
                          <div className="unit-name">{u.name}</div>
                          <div className="unit-bhk">{u.bhk_type}</div>
                          <span className={`badge badge-${u.status}`}>{u.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Occupants Section */}
              {selectedUnitId && (
                <div className="section">
                  <h2>Occupants - {selectedUnitLabel}</h2>
                  {occMessage && <div className="success">{occMessage}</div>}
                  <div className="form-horizontal">
                    <input
                      type="text"
                      value={occName}
                      onChange={(e) => setOccName(e.target.value)}
                      placeholder="Name"
                    />
                    <input
                      type="tel"
                      value={occPhone}
                      onChange={(e) => setOccPhone(e.target.value)}
                      placeholder="Phone"
                    />
                    <select
                      value={occRole}
                      onChange={(e) => setOccRole(e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="tenant">Tenant</option>
                    </select>
                    <button onClick={createOccupant}>Add Occupant</button>
                  </div>

                  {occupants.length > 0 && (
                    <ul className="occupant-list">
                      {occupants.map((occ) => (
                        <li key={occ.id} className="occupant-item">
                          <div>
                            <strong>{occ.name}</strong>
                            <span className="role-badge">{occ.role}</span>
                            <div className="occupant-phone">{occ.phone}</div>
                          </div>
                          <span className={`badge badge-${occ.is_active ? 'active' : 'inactive'}`}>
                            {occ.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Invoices Section */}
              {selectedUnitId && (
                <div className="section">
                  <h2>Maintenance Invoices - {selectedUnitLabel}</h2>
                  {invMessage && <div className="success">{invMessage}</div>}
                  <div className="form-horizontal">
                    <input
                      type="text"
                      value={invPeriod}
                      onChange={(e) => setInvPeriod(e.target.value)}
                      placeholder="Period (e.g. Jan 2024)"
                    />
                    <input
                      type="number"
                      value={invAmount}
                      onChange={(e) => setInvAmount(e.target.value)}
                      placeholder="Amount (₹)"
                      min="0"
                    />
                    <input
                      type="date"
                      value={invDueDate}
                      onChange={(e) => setInvDueDate(e.target.value)}
                    />
                    <button onClick={createInvoice}>Create Invoice</button>
                  </div>

                  {invoices.length > 0 && (
                    <>
                      <div className="filter-bar">
                        <input
                          className="search-input"
                          type="text"
                          value={invFilterMonth}
                          onChange={(e) => {
                            setInvFilterMonth(e.target.value);
                            if (selectedUnitId) {
                              fetchInvoices(selectedUnitId, e.target.value || undefined);
                            }
                          }}
                          placeholder="Filter by month (YYYY-MM)"
                        />
                      </div>

                      <div className="table-container">
                        <table className="invoice-table">
                          <thead>
                            <tr>
                              <th>Period</th>
                              <th>Amount</th>
                              <th>Due Date</th>
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
                                  <span className={`badge badge-${inv.status}`}>
                                    {inv.status}
                                  </span>
                                </td>
                                <td>
                                  {inv.status !== "paid" && (
                                    <button
                                      onClick={() => markPaid(inv.id)}
                                      className="btn-small"
                                    >
                                      Mark Paid
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="invoice-summary">
                        Total Due: <strong>₹{invoices.filter(i => i.status === 'due').reduce((sum, i) => sum + i.amount, 0)}</strong>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}