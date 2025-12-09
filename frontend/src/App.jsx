import { useState, useEffect, useCallback, useMemo } from "react";
import "./App.css";

// API Configuration
const API_BASE_URL = "http://localhost:8000";

// Custom hook for API calls with auth
const useApi = () => {
  const getToken = () => localStorage.getItem('token');
  
  const fetchWithAuth = useCallback(async (url, options = {}) => {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });
    
    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('mobile');
      window.location.reload();
    }
    
    return response;
  }, []);
  
  return { fetchWithAuth };
};

// Loading Spinner Component
const LoadingSpinner = () => (
  <div className="spinner">
    <div className="spinner-circle"></div>
  </div>
);

// Toast Notification Component
const Toast = ({ message, type, onClose }) => (
  <div className={`toast toast-${type}`}>
    <span>{message}</span>
    <button className="toast-close" onClick={onClose}>×</button>
  </div>
);

export default function App() {
  // Auth state
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("mobile");
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState("checking...");
  const [toast, setToast] = useState(null);
  
  // Data state
  const [apartments, setApartments] = useState([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [occupants, setOccupants] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  
  // Form state
  const [aptForm, setAptForm] = useState({ name: "", city: "", total_units: "" });
  const [unitForm, setUnitForm] = useState({ name: "", bhk_type: "2BHK", status: "vacant" });
  const [occForm, setOccForm] = useState({ name: "", phone: "", role: "owner" });
  const [invForm, setInvForm] = useState({ period_label: "", amount: "", due_date: "" });
  const [invFilterMonth, setInvFilterMonth] = useState("");
  
  // Search and filter
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  
  const { fetchWithAuth } = useApi();
  
  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);
  
  // Show toast notification
  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);
  
  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        const data = await res.json();
        setBackendStatus(data.status === "ok" ? "online" : "offline");
      } catch {
        setBackendStatus("offline");
      }
    };
    checkBackend();
  }, []);
  
  // Auto-login if token exists
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedMobile = localStorage.getItem('mobile');
    
    if (token && savedMobile) {
      setMobile(savedMobile);
      setStep('apartment');
      loadInitialData();
    }
  }, []);
  
  // Load initial data
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchApartments(),
        fetchDashboard()
      ]);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Auth functions
  const sendOtp = async () => {
    if (!isValidMobile) {
      showToast("Invalid mobile number", "error");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetchWithAuth("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ mobile }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.detail || "Failed to send OTP", "error");
        return;
      }
      
      setRequestId(data.request_id);
      setStep("otp");
      showToast("OTP sent successfully", "success");
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const verifyOtp = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId, mobile, otp }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.detail || "OTP verification failed", "error");
        return;
      }
      
      // Store token
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('mobile', mobile);
      
      setStep("apartment");
      showToast("Login successful!", "success");
      await loadInitialData();
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('mobile');
    setStep('mobile');
    setMobile('');
    setApartments([]);
    setSelectedApartmentId(null);
    showToast("Logged out successfully", "info");
  };
  
  // Data fetching functions
  const fetchApartments = async () => {
    try {
      const res = await fetchWithAuth("/apartments");
      if (!res.ok) return;
      const data = await res.json();
      setApartments(data.apartments || []);
    } catch (error) {
      console.error("Failed to fetch apartments:", error);
    }
  };
  
  const fetchDashboard = async () => {
    try {
      const res = await fetchWithAuth("/dashboard");
      if (!res.ok) return;
      const data = await res.json();
      setDashboard(data);
    } catch (error) {
      console.error("Failed to fetch dashboard:", error);
    }
  };
  
  const fetchUnits = async (apartmentId) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/apartments/${apartmentId}/units`);
      if (!res.ok) return;
      const data = await res.json();
      setUnits(data.units || []);
    } catch (error) {
      console.error("Failed to fetch units:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchOccupants = async (unitId) => {
    try {
      const res = await fetchWithAuth(`/units/${unitId}/occupants`);
      if (!res.ok) return;
      const data = await res.json();
      setOccupants(data.occupants || []);
    } catch (error) {
      console.error("Failed to fetch occupants:", error);
    }
  };
  
  const fetchInvoices = async (unitId, month = null) => {
    try {
      const url = month 
        ? `/units/${unitId}/invoices?month=${month}`
        : `/units/${unitId}/invoices`;
      const res = await fetchWithAuth(url);
      if (!res.ok) return;
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    }
  };
  
  // CRUD operations
  const createApartment = async (e) => {
    e?.preventDefault();
    if (!aptForm.name || !aptForm.city || !aptForm.total_units) {
      showToast("Please fill all fields", "error");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetchWithAuth("/apartments", {
        method: "POST",
        body: JSON.stringify({
          name: aptForm.name,
          city: aptForm.city,
          total_units: parseInt(aptForm.total_units, 10),
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.detail || "Failed to create apartment", "error");
        return;
      }
      
      showToast(`Apartment "${data.name}" created!`, "success");
      setAptForm({ name: "", city: "", total_units: "" });
      await Promise.all([fetchApartments(), fetchDashboard()]);
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const createUnit = async (e) => {
    e?.preventDefault();
    if (!selectedApartmentId) {
      showToast("Please select an apartment first", "error");
      return;
    }
    if (!unitForm.name) {
      showToast("Please enter unit name", "error");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/apartments/${selectedApartmentId}/units`, {
        method: "POST",
        body: JSON.stringify(unitForm),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.detail || "Failed to create unit", "error");
        return;
      }
      
      showToast(`Unit "${data.name}" created!`, "success");
      setUnitForm({ name: "", bhk_type: "2BHK", status: "vacant" });
      await fetchUnits(selectedApartmentId);
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const createOccupant = async (e) => {
    e?.preventDefault();
    if (!selectedUnitId) {
      showToast("Please select a unit first", "error");
      return;
    }
    if (!occForm.name || !occForm.phone) {
      showToast("Please fill all fields", "error");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/units/${selectedUnitId}/occupants`, {
        method: "POST",
        body: JSON.stringify(occForm),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.detail || "Failed to add occupant", "error");
        return;
      }
      
      showToast(`Occupant "${data.name}" added!`, "success");
      setOccForm({ name: "", phone: "", role: "owner" });
      await Promise.all([
        fetchOccupants(selectedUnitId),
        fetchUnits(selectedApartmentId)
      ]);
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const createInvoice = async (e) => {
    e?.preventDefault();
    if (!selectedUnitId) {
      showToast("Please select a unit first", "error");
      return;
    }
    if (!invForm.period_label || !invForm.amount || !invForm.due_date) {
      showToast("Please fill all fields", "error");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/units/${selectedUnitId}/invoices`, {
        method: "POST",
        body: JSON.stringify({
          ...invForm,
          amount: parseInt(invForm.amount, 10)
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.detail || "Failed to create invoice", "error");
        return;
      }
      
      showToast("Invoice created successfully!", "success");
      setInvForm({ period_label: "", amount: "", due_date: "" });
      await fetchInvoices(selectedUnitId, invFilterMonth || null);
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  const markInvoicePaid = async (invoiceId) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/invoices/${invoiceId}/mark-paid`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const data = await res.json();
        showToast(data.detail || "Failed to mark as paid", "error");
        return;
      }
      
      showToast("Invoice marked as paid!", "success");
      await Promise.all([
        fetchInvoices(selectedUnitId, invFilterMonth || null),
        fetchDashboard()
      ]);
    } catch {
      showToast("Could not reach server", "error");
    } finally {
      setLoading(false);
    }
  };
  
  // Handlers
  const handleSelectApartment = useCallback((apt) => {
    setSelectedApartmentId(apt.id);
    setSelectedUnitId(null);
    setUnits([]);
    setOccupants([]);
    setInvoices([]);
    fetchUnits(apt.id);
  }, []);
  
  const handleSelectUnit = useCallback((unit) => {
    setSelectedUnitId(unit.id);
    setOccupants([]);
    setInvoices([]);
    fetchOccupants(unit.id);
    fetchInvoices(unit.id, invFilterMonth || null);
  }, [invFilterMonth]);
  
  const handleApplyInvoiceFilter = () => {
    if (selectedUnitId) {
      fetchInvoices(selectedUnitId, invFilterMonth);
    }
  };
  
  const handleClearInvoiceFilter = () => {
    setInvFilterMonth("");
    if (selectedUnitId) {
      fetchInvoices(selectedUnitId, null);
    }
  };
  
  // Computed values
  const selectedApartment = useMemo(() => 
    apartments.find(a => a.id === selectedApartmentId),
    [apartments, selectedApartmentId]
  );
  
  const filteredUnits = useMemo(() => {
    return units.filter(unit => {
      const matchesSearch = unit.name.toLowerCase().includes(unitSearch.toLowerCase());
      const matchesStatus = unitStatusFilter === 'all' || unit.status === unitStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [units, unitSearch, unitStatusFilter]);
  
  const selectedUnit = useMemo(() => 
    units.find(u => u.id === selectedUnitId),
    [units, selectedUnitId]
  );
  
  const totalDue = useMemo(() => 
    invoices.reduce((sum, inv) => inv.status !== 'paid' ? sum + inv.amount : sum, 0),
    [invoices]
  );
  
  return (
    <div className="screen">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      
      <div className="app-container">
        {/* Login Screen */}
        {step === "mobile" && (
          <div className="card">
            <h2>Welcome to OurNest</h2>
            <div className="backend-status">
              Backend:{" "}
              <span className={backendStatus === "online" ? "status-ok" : "status-bad"}>
                {backendStatus}
              </span>
            </div>
            
            <p className="welcome-text">Enter your mobile number to continue</p>
            
            <input
              type="tel"
              placeholder="Enter 10-digit mobile"
              maxLength="10"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendOtp()}
              disabled={loading}
            />
            
            <button
              onClick={sendOtp}
              disabled={!isValidMobile || loading}
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </div>
        )}
        
        {/* OTP Verification Screen */}
        {step === "otp" && (
          <div className="card">
            <h2>Verify OTP</h2>
            <p className="welcome-text">Enter the 4-digit OTP sent to {mobile}</p>
            
            <input
              type="text"
              placeholder="Enter 4-digit OTP"
              maxLength="4"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyPress={(e) => e.key === 'Enter' && verifyOtp()}
              disabled={loading}
              autoFocus
            />
            
            <button
              onClick={verifyOtp}
              disabled={otp.length !== 4 || loading}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            
            <button
              className="btn-secondary"
              onClick={() => setStep("mobile")}
              disabled={loading}
            >
              Back
            </button>
          </div>
        )}
        
        {/* Main Dashboard */}
        {step === "apartment" && (
          <div className="dashboard-layout">
            {/* Sidebar */}
            <div className="sidebar">
              <div className="sidebar-header">
                <h2>OurNest</h2>
                <button className="btn-small btn-ghost" onClick={logout}>
                  Logout
                </button>
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
              
              {/* Apartment List */}
              <div className="section">
                <h3>Your Apartments</h3>
                {apartments.length > 0 ? (
                  <ul className="apt-list">
                    {apartments.map((apt) => (
                      <li
                        key={apt.id}
                        className={apt.id === selectedApartmentId ? "apt-item selected" : "apt-item"}
                        onClick={() => handleSelectApartment(apt)}
                      >
                        <strong>{apt.name}</strong>
                        <div className="apt-meta">{apt.city} • {apt.total_units} units</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state-small">
                    No apartments yet
                  </div>
                )}
              </div>
            </div>
            
            {/* Main Content */}
            <div className="main-content">
              {loading && <div className="loading-overlay"><LoadingSpinner /></div>}
              
              {/* Create Apartment Form */}
              <div className="section">
                <h2>Create New Apartment</h2>
                <form onSubmit={createApartment} className="form-horizontal">
                  <input
                    placeholder="Apartment Name"
                    value={aptForm.name}
                    onChange={(e) => setAptForm({ ...aptForm, name: e.target.value })}
                  />
                  <input
                    placeholder="City"
                    value={aptForm.city}
                    onChange={(e) => setAptForm({ ...aptForm, city: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Total Units"
                    value={aptForm.total_units}
                    onChange={(e) => setAptForm({ ...aptForm, total_units: e.target.value })}
                  />
                  <button type="submit">Create</button>
                </form>
              </div>
              
              {/* Units Section */}
              {selectedApartmentId && (
                <>
                  <div className="section">
                    <h2>Units in {selectedApartment?.name}</h2>
                    
                    {/* Search and Filter */}
                    <div className="filter-bar">
                      <input
                        className="search-input"
                        placeholder="Search units..."
                        value={unitSearch}
                        onChange={(e) => setUnitSearch(e.target.value)}
                      />
                      <select
                        value={unitStatusFilter}
                        onChange={(e) => setUnitStatusFilter(e.target.value)}
                      >
                        <option value="all">All Status</option>
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                      </select>
                    </div>
                    
                    {/* Create Unit Form */}
                    <form onSubmit={createUnit} className="form-horizontal">
                      <input
                        placeholder="Unit number (e.g., 101)"
                        value={unitForm.name}
                        onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                      />
                      <select
                        value={unitForm.bhk_type}
                        onChange={(e) => setUnitForm({ ...unitForm, bhk_type: e.target.value })}
                      >
                        <option value="1BHK">1BHK</option>
                        <option value="2BHK">2BHK</option>
                        <option value="3BHK">3BHK</option>
                        <option value="4BHK">4BHK</option>
                      </select>
                      <select
                        value={unitForm.status}
                        onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })}
                      >
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                      </select>
                      <button type="submit">Add Unit</button>
                    </form>
                    
                    {/* Units List */}
                    {filteredUnits.length > 0 ? (
                      <div className="units-grid">
                        {filteredUnits.map((unit) => (
                          <div
                            key={unit.id}
                            className={unit.id === selectedUnitId ? "unit-card selected" : "unit-card"}
                            onClick={() => handleSelectUnit(unit)}
                          >
                            <div className="unit-name">{unit.name}</div>
                            <div className="unit-bhk">{unit.bhk_type}</div>
                            <span className={`badge badge-${unit.status}`}>
                              {unit.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <div className="empty-state-icon">🏠</div>
                        <div>No units found</div>
                      </div>
                    )}
                  </div>
                  
                  {/* Occupants Section */}
                  {selectedUnitId && (
                    <div className="section">
                      <h2>Occupants - Unit {selectedUnit?.name}</h2>
                      
                      <form onSubmit={createOccupant} className="form-horizontal">
                        <input
                          placeholder="Name"
                          value={occForm.name}
                          onChange={(e) => setOccForm({ ...occForm, name: e.target.value })}
                        />
                        <input
                          placeholder="Phone"
                          value={occForm.phone}
                          onChange={(e) => setOccForm({ ...occForm, phone: e.target.value })}
                        />
                        <select
                          value={occForm.role}
                          onChange={(e) => setOccForm({ ...occForm, role: e.target.value })}
                        >
                          <option value="owner">Owner</option>
                          <option value="tenant">Tenant</option>
                        </select>
                        <button type="submit">Add Occupant</button>
                      </form>
                      
                      {occupants.length > 0 && (
                        <ul className="occupant-list">
                          {occupants.map((occ) => (
                            <li key={occ.id} className="occupant-item">
                              <div>
                                <strong>{occ.name}</strong>
                                <span className="role-badge">{occ.role}</span>
                              </div>
                              <div className="occupant-phone">{occ.phone}</div>
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
                      <h2>Maintenance & Invoices - Unit {selectedUnit?.name}</h2>
                      
                      {/* Filter */}
                      <div className="filter-bar">
                        <input
                          type="month"
                          value={invFilterMonth}
                          onChange={(e) => setInvFilterMonth(e.target.value)}
                        />
                        <button className="btn-small" onClick={handleApplyInvoiceFilter}>
                          Filter
                        </button>
                        {invFilterMonth && (
                          <button className="btn-ghost" onClick={handleClearInvoiceFilter}>
                            Clear
                          </button>
                        )}
                      </div>
                      
                      {/* Create Invoice Form */}
                      <form onSubmit={createInvoice} className="form-horizontal">
                        <input
                          placeholder='Period (e.g., "Jan 2025")'
                          value={invForm.period_label}
                          onChange={(e) => setInvForm({ ...invForm, period_label: e.target.value })}
                        />
                        <input
                          type="number"
                          placeholder="Amount"
                          value={invForm.amount}
                          onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })}
                        />
                        <input
                          type="date"
                          value={invForm.due_date}
                          onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })}
                        />
                        <button type="submit">Create Invoice</button>
                      </form>
                      
                      {/* Invoice Summary */}
                      {invoices.length > 0 && (
                        <div className="invoice-summary">
                          <span>Total Due: <strong>₹{totalDue}</strong></span>
                        </div>
                      )}
                      
                      {/* Invoices Table */}
                      {invoices.length > 0 ? (
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
                                    <span className={`badge badge-${inv.status === 'paid' ? 'paid' : 'due'}`}>
                                      {inv.status}
                                    </span>
                                  </td>
                                  <td>
                                    {inv.status !== 'paid' && (
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
                        </div>
                      ) : (
                        <div className="empty-state-small">No invoices yet</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}