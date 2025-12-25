import { useState, useEffect } from "react";
import "./App.css";

// Use environment variable for API URL, fallback to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [step, setStep] = useState("mobile");
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking...");

  // Popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState("error"); // "error" or "success"

  // Apartment form + list
  const [aptName, setAptName] = useState("");
  const [aptCity, setAptCity] = useState("");
  const [aptUnits, setAptUnits] = useState("");
  const [aptMessage, setAptMessage] = useState("");
  const [createdApartments, setCreatedApartments] = useState([]);
  const [editingApartmentId, setEditingApartmentId] = useState(null);
  const [aptNameExists, setAptNameExists] = useState(false);

  // Selected apartment for Units
  const [selectedApartmentId, setSelectedApartmentId] = useState(null);
  const [selectedApartmentName, setSelectedApartmentName] = useState("");

  // Units
  const [units, setUnits] = useState([]);
  const [unitName, setUnitName] = useState("");
  const [unitBhk, setUnitBhk] = useState("2BHK");
  const [unitStatus, setUnitStatus] = useState("vacant");
  const [unitMessage, setUnitMessage] = useState("");
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [unitNameExists, setUnitNameExists] = useState(false);

  // Selected unit for occupants / invoices
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedUnitLabel, setSelectedUnitLabel] = useState("");

  // Occupants
  const [occupants, setOccupants] = useState([]);
  const [occName, setOccName] = useState("");
  const [occPhone, setOccPhone] = useState("");
  const [occRole, setOccRole] = useState("owner");
  const [occMessage, setOccMessage] = useState("");
  const [editingOccupantId, setEditingOccupantId] = useState(null);
  const [occPhoneExists, setOccPhoneExists] = useState(false);

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [invPeriod, setInvPeriod] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invDueDate, setInvDueDate] = useState("");
  const [invMessage, setInvMessage] = useState("");
  const [invFilterMonth, setInvFilterMonth] = useState("");
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);

  // Dashboard
  const [dashboard, setDashboard] = useState(null);

  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  // Helper to show popup
  const showPopupMessage = (message, type = "error") => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 4000);
  };

  // Helper to get auth headers with JWT token
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

      // Log OTP to console in dev mode with nice formatting
      if (data.dev_mode && data.otp) {
        console.clear();
        console.log("%c=================================", "color: #4CAF50; font-weight: bold; font-size: 14px;");
        console.log("%c🔐 DEV MODE - OTP FOR TESTING", "color: #2196F3; font-size: 18px; font-weight: bold;");
        console.log("%c=================================", "color: #4CAF50; font-weight: bold; font-size: 14px;");
        console.log(`%cMobile: ${mobile}`, "color: #666; font-size: 14px;");
        console.log(`%cOTP: ${data.otp}`, "color: #FF5722; font-size: 24px; font-weight: bold;");
        console.log("%c=================================", "color: #4CAF50; font-weight: bold; font-size: 14px;");
        
        // Auto-fill OTP for easier testing
        setOtp(data.otp);
      }

      setRequestId(data.request_id);
      setStep("otp");
    } catch {
      setError("Could not reach server.");
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

      // CRITICAL: Save the JWT token!
      setAccessToken(data.access_token);
      
      console.log("✅ Login successful! Token saved.");
      
      setStep("apartment");
      setAptMessage("OTP verified! Let's onboard your apartment.");
      
      // Wait a moment for state to update, then fetch
      setTimeout(() => {
        fetchApartments(data.access_token);
        fetchDashboard(data.access_token);
      }, 100);
    } catch {
      setError("Could not reach server.");
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
        console.error("Failed to fetch apartments:", res.status);
        setCreatedApartments([]);
        return;
      }
      const data = await res.json();
      setCreatedApartments(data.apartments || []);
    } catch (err) {
      console.error("Error fetching apartments:", err);
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
        console.error("Failed to fetch dashboard:", res.status);
        setDashboard(null);
        return;
      }
      const data = await res.json();
      setDashboard(data);
    } catch (err) {
      console.error("Error fetching dashboard:", err);
      setDashboard(null);
    }
  };

  // Check apartment name uniqueness
  const checkApartmentNameExists = async (name) => {
    if (!name.trim() || name.length < 2) {
      setAptNameExists(false);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/apartments/check-name?name=${encodeURIComponent(name.trim())}`,
        {
          headers: getAuthHeaders(),
        }
      );
      const data = await res.json();
      
      // If editing, don't mark as exists if it's the same apartment
      if (editingApartmentId && data.exists && data.apartment_id === editingApartmentId) {
        setAptNameExists(false);
      } else {
        setAptNameExists(data.exists);
      }
    } catch {
      setAptNameExists(false);
    }
  };

  const createApartment = async () => {
    setAptMessage("");

    // Validation
    if (!aptName.trim()) {
      showPopupMessage("Apartment name is required");
      return;
    }
    if (aptName.trim().length < 2) {
      showPopupMessage("Apartment name must be at least 2 characters");
      return;
    }
    if (aptNameExists) {
      showPopupMessage("Apartment name already exists");
      return;
    }
    if (!aptCity.trim()) {
      showPopupMessage("City is required");
      return;
    }
    if (aptCity.trim().length < 2) {
      showPopupMessage("City name must be at least 2 characters");
      return;
    }
    if (!aptUnits || parseInt(aptUnits) <= 0) {
      showPopupMessage("Total units must be greater than 0");
      return;
    }

    const totalUnitsNum = parseInt(aptUnits, 10);

    try {
      const url = editingApartmentId
        ? `${API_BASE_URL}/apartments/${editingApartmentId}`
        : `${API_BASE_URL}/apartments`;
      
      const method = editingApartmentId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: aptName.trim(),
          city: aptCity.trim(),
          total_units: totalUnitsNum,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showPopupMessage(data.detail || "Could not save apartment.");
        return;
      }

      const message = editingApartmentId
        ? `Apartment "${data.name}" updated successfully!`
        : `Apartment "${data.name}" created successfully!`;
      
      showPopupMessage(message, "success");
      setAptName("");
      setAptCity("");
      setAptUnits("");
      setEditingApartmentId(null);
      fetchApartments();
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  const editApartment = (apt) => {
    setAptName(apt.name);
    setAptCity(apt.city);
    setAptUnits(apt.total_units.toString());
    setEditingApartmentId(apt.id);
    setAptNameExists(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditApartment = () => {
    setAptName("");
    setAptCity("");
    setAptUnits("");
    setEditingApartmentId(null);
    setAptNameExists(false);
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

  // Check unit name uniqueness
  const checkUnitNameExists = async (name) => {
    if (!selectedApartmentId || !name.trim()) {
      setUnitNameExists(false);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/apartments/${selectedApartmentId}/units/check-name?name=${encodeURIComponent(name.trim())}`,
        {
          headers: getAuthHeaders(),
        }
      );
      const data = await res.json();
      
      // If editing, don't mark as exists if it's the same unit
      if (editingUnitId && data.exists && data.unit_id === editingUnitId) {
        setUnitNameExists(false);
      } else {
        setUnitNameExists(data.exists);
      }
    } catch {
      setUnitNameExists(false);
    }
  };

  const createUnit = async () => {
    if (!selectedApartmentId) {
      showPopupMessage("Please select an apartment first.");
      return;
    }
    setUnitMessage("");

    // Validation
    if (!unitName.trim()) {
      showPopupMessage("Unit name is required");
      return;
    }
    if (unitNameExists) {
      showPopupMessage("Unit name already exists in this apartment");
      return;
    }

    try {
      const url = editingUnitId
        ? `${API_BASE_URL}/units/${editingUnitId}`
        : `${API_BASE_URL}/apartments/${selectedApartmentId}/units`;
      
      const method = editingUnitId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: unitName.trim(),
          bhk_type: unitBhk,
          status: unitStatus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showPopupMessage(data.detail || "Could not save unit.");
        return;
      }

      const message = editingUnitId
        ? `Unit "${data.name}" updated successfully!`
        : `Unit "${data.name}" created successfully!`;
      
      showPopupMessage(message, "success");
      setUnitName("");
      setUnitBhk("2BHK");
      setUnitStatus("vacant");
      setEditingUnitId(null);
      fetchUnits(selectedApartmentId);
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  const editUnit = (u) => {
    setUnitName(u.name);
    setUnitBhk(u.bhk_type);
    setUnitStatus(u.status);
    setEditingUnitId(u.id);
    setUnitNameExists(false);
  };

  const cancelEditUnit = () => {
    setUnitName("");
    setUnitBhk("2BHK");
    setUnitStatus("vacant");
    setEditingUnitId(null);
    setUnitNameExists(false);
  };

  const deleteUnit = async (unitId) => {
    if (!confirm("Are you sure you want to delete this unit?")) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/units/${unitId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        showPopupMessage(data.detail || "Could not delete unit.");
        return;
      }

      showPopupMessage("Unit deleted successfully!", "success");
      fetchUnits(selectedApartmentId);
      fetchDashboard();
      
      // Clear selected unit if it was deleted
      if (selectedUnitId === unitId) {
        setSelectedUnitId(null);
        setSelectedUnitLabel("");
        setOccupants([]);
        setInvoices([]);
      }
    } catch {
      showPopupMessage("Could not reach server.");
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

  // Check occupant phone uniqueness
  const checkOccupantPhoneExists = async (phone) => {
    if (!selectedUnitId || !phone.trim() || phone.trim().length < 10) {
      setOccPhoneExists(false);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/units/${selectedUnitId}/occupants/check-phone?phone=${encodeURIComponent(phone.trim())}`,
        {
          headers: getAuthHeaders(),
        }
      );
      const data = await res.json();
      
      // If editing, don't mark as exists if it's the same occupant
      if (editingOccupantId && data.exists && data.occupant_id === editingOccupantId) {
        setOccPhoneExists(false);
      } else {
        setOccPhoneExists(data.exists);
      }
    } catch {
      setOccPhoneExists(false);
    }
  };

  const createOccupant = async () => {
    if (!selectedUnitId) {
      showPopupMessage("Please select a unit first.");
      return;
    }
    setOccMessage("");

    // Validation
    if (!occName.trim()) {
      showPopupMessage("Occupant name is required");
      return;
    }
    if (occName.trim().length < 2) {
      showPopupMessage("Name must be at least 2 characters");
      return;
    }
    if (!occPhone.trim()) {
      showPopupMessage("Phone number is required");
      return;
    }
    if (occPhone.trim().length < 10) {
      showPopupMessage("Phone number must be at least 10 digits");
      return;
    }
    if (occPhoneExists) {
      showPopupMessage("Phone number already exists in this unit");
      return;
    }

    try {
      const url = editingOccupantId
        ? `${API_BASE_URL}/occupants/${editingOccupantId}`
        : `${API_BASE_URL}/units/${selectedUnitId}/occupants`;
      
      const method = editingOccupantId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: occName.trim(),
          phone: occPhone.trim(),
          role: occRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showPopupMessage(data.detail || "Could not save occupant.");
        return;
      }

      const message = editingOccupantId
        ? `Occupant "${data.name}" updated successfully!`
        : `Occupant "${data.name}" (${data.role}) added successfully!`;
      
      showPopupMessage(message, "success");
      setOccName("");
      setOccPhone("");
      setOccRole("owner");
      setEditingOccupantId(null);
      fetchOccupants(selectedUnitId);

      if (selectedApartmentId) {
        fetchUnits(selectedApartmentId);
      }
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  const editOccupant = (occ) => {
    setOccName(occ.name);
    setOccPhone(occ.phone);
    setOccRole(occ.role);
    setEditingOccupantId(occ.id);
    setOccPhoneExists(false);
  };

  const cancelEditOccupant = () => {
    setOccName("");
    setOccPhone("");
    setOccRole("owner");
    setEditingOccupantId(null);
    setOccPhoneExists(false);
  };

  const deleteOccupant = async (occupantId) => {
    if (!confirm("Are you sure you want to delete this occupant?")) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/occupants/${occupantId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        showPopupMessage(data.detail || "Could not delete occupant.");
        return;
      }

      showPopupMessage("Occupant deleted successfully!", "success");
      fetchOccupants(selectedUnitId);
      if (selectedApartmentId) {
        fetchUnits(selectedApartmentId);
      }
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
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
      showPopupMessage("Please select a unit first.");
      return;
    }
    setInvMessage("");

    // Validation
    if (!invPeriod.trim()) {
      showPopupMessage("Period label is required (e.g., 'Jan 2024')");
      return;
    }
    if (invPeriod.trim().length < 3) {
      showPopupMessage("Period label must be at least 3 characters");
      return;
    }
    if (!invAmount || parseInt(invAmount) <= 0) {
      showPopupMessage("Amount must be greater than 0");
      return;
    }
    if (!invDueDate) {
      showPopupMessage("Due date is required");
      return;
    }

    const amountNum = parseInt(invAmount, 10);

    try {
      const url = editingInvoiceId
        ? `${API_BASE_URL}/invoices/${editingInvoiceId}`
        : `${API_BASE_URL}/units/${selectedUnitId}/invoices`;
      
      const method = editingInvoiceId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          period_label: invPeriod.trim(),
          amount: amountNum,
          due_date: invDueDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showPopupMessage(data.detail || "Could not save invoice.");
        return;
      }

      const message = editingInvoiceId
        ? `Invoice for "${data.period_label}" updated successfully!`
        : `Invoice for "${data.period_label}" created successfully!`;
      
      showPopupMessage(message, "success");
      setInvPeriod("");
      setInvAmount("");
      setInvDueDate("");
      setEditingInvoiceId(null);
      fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  const editInvoice = (inv) => {
    setInvPeriod(inv.period_label);
    setInvAmount(inv.amount.toString());
    setInvDueDate(inv.due_date);
    setEditingInvoiceId(inv.id);
  };

  const cancelEditInvoice = () => {
    setInvPeriod("");
    setInvAmount("");
    setInvDueDate("");
    setEditingInvoiceId(null);
  };

  const deleteInvoice = async (invoiceId) => {
    if (!confirm("Are you sure you want to delete this invoice?")) {
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/invoices/${invoiceId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        showPopupMessage(data.detail || "Could not delete invoice.");
        return;
      }

      showPopupMessage("Invoice deleted successfully!", "success");
      fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  const markPaid = async (invoiceId) => {
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
        showPopupMessage(data.detail || "Could not mark invoice as paid.");
        return;
      }

      showPopupMessage("Invoice marked as paid!", "success");
      fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  const markUnpaid = async (invoiceId) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/invoices/${invoiceId}/mark-unpaid`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        showPopupMessage(data.detail || "Could not mark invoice as unpaid.");
        return;
      }

      showPopupMessage("Invoice marked as unpaid!", "success");
      fetchInvoices(selectedUnitId, invFilterMonth || undefined);
      fetchDashboard();
    } catch {
      showPopupMessage("Could not reach server.");
    }
  };

  // UI render starts here
  return (
    <div className="screen">
      {/* Popup Message */}
      {showPopup && (
        <div className={`popup ${popupType}`}>
          <div className="popup-content">
            <span className="popup-icon">
              {popupType === "success" ? "✓" : "⚠"}
            </span>
            <span className="popup-text">{popupMessage}</span>
          </div>
        </div>
      )}

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
            <p style={{fontSize: '12px', color: '#666', marginTop: '8px'}}>
              💡 Check browser console (F12) for OTP in dev mode
            </p>
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
                      >
                        <div onClick={() => handleSelectApartment(apt)} style={{cursor: 'pointer', flex: 1}}>
                          <strong>{apt.name}</strong>
                          <div className="apt-meta">{apt.city} • {apt.total_units} units</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            editApartment(apt);
                          }}
                          className="btn-icon"
                          title="Edit"
                        >
                          ✏️
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
              {/* Create/Edit Apartment */}
              <div className="section">
                <h2>{editingApartmentId ? "Edit Apartment" : "Create New Apartment"}</h2>
                {aptMessage && <div className="success">{aptMessage}</div>}
                <div className="form-horizontal">
                  <div style={{position: 'relative', flex: 1}}>
                    <input
                      type="text"
                      value={aptName}
                      onChange={(e) => setAptName(e.target.value)}
                      onBlur={(e) => checkApartmentNameExists(e.target.value)}
                      placeholder="Apartment name *"
                      required
                      style={{borderColor: aptNameExists ? '#ef4444' : undefined}}
                    />
                    {aptNameExists && (
                      <span style={{color: '#ef4444', fontSize: '12px', position: 'absolute', bottom: '-18px', left: 0}}>
                        Name already exists
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={aptCity}
                    onChange={(e) => setAptCity(e.target.value)}
                    placeholder="City *"
                    required
                  />
                  <input
                    type="number"
                    value={aptUnits}
                    onChange={(e) => setAptUnits(e.target.value)}
                    placeholder="Total units *"
                    min="1"
                    required
                  />
                  <button onClick={createApartment}>
                    {editingApartmentId ? "Update" : "Create"} Apartment
                  </button>
                  {editingApartmentId && (
                    <button onClick={cancelEditApartment} className="btn-secondary">
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Units Section */}
              {selectedApartmentId && (
                <div className="section">
                  <h2>Units in {selectedApartmentName}</h2>
                  {unitMessage && <div className="success">{unitMessage}</div>}
                  <div className="form-horizontal">
                    <div style={{position: 'relative', flex: 1}}>
                      <input
                        type="text"
                        value={unitName}
                        onChange={(e) => setUnitName(e.target.value)}
                        onBlur={(e) => checkUnitNameExists(e.target.value)}
                        placeholder="Unit name (e.g. A-101) *"
                        required
                        style={{borderColor: unitNameExists ? '#ef4444' : undefined}}
                      />
                      {unitNameExists && (
                        <span style={{color: '#ef4444', fontSize: '12px', position: 'absolute', bottom: '-18px', left: 0}}>
                          Unit name already exists
                        </span>
                      )}
                    </div>
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
                    <button onClick={createUnit}>
                      {editingUnitId ? "Update" : "Add"} Unit
                    </button>
                    {editingUnitId && (
                      <button onClick={cancelEditUnit} className="btn-secondary">
                        Cancel
                      </button>
                    )}
                  </div>

                  {units.length > 0 && (
                    <div className="units-grid">
                      {units.map((u) => (
                        <div
                          key={u.id}
                          className={`unit-card ${selectedUnitId === u.id ? "selected" : ""}`}
                        >
                          <div onClick={() => handleSelectUnit(u)} style={{cursor: 'pointer'}}>
                            <div className="unit-name">{u.name}</div>
                            <div className="unit-bhk">{u.bhk_type}</div>
                            <span className={`badge badge-${u.status}`}>{u.status}</span>
                          </div>
                          <div style={{display: 'flex', gap: '4px', marginTop: '8px'}}>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                editUnit(u);
                              }}
                              className="btn-small"
                              style={{flex: 1}}
                            >
                              Edit
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteUnit(u.id);
                              }}
                              className="btn-small"
                              style={{flex: 1, background: '#ef4444'}}
                            >
                              Delete
                            </button>
                          </div>
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
                      placeholder="Name *"
                      required
                    />
                    <div style={{position: 'relative', flex: 1}}>
                      <input
                        type="tel"
                        value={occPhone}
                        onChange={(e) => setOccPhone(e.target.value)}
                        onBlur={(e) => checkOccupantPhoneExists(e.target.value)}
                        placeholder="Phone *"
                        required
                        style={{borderColor: occPhoneExists ? '#ef4444' : undefined}}
                      />
                      {occPhoneExists && (
                        <span style={{color: '#ef4444', fontSize: '12px', position: 'absolute', bottom: '-18px', left: 0}}>
                          Phone already exists
                        </span>
                      )}
                    </div>
                    <select
                      value={occRole}
                      onChange={(e) => setOccRole(e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="tenant">Tenant</option>
                    </select>
                    <button onClick={createOccupant}>
                      {editingOccupantId ? "Update" : "Add"} Occupant
                    </button>
                    {editingOccupantId && (
                      <button onClick={cancelEditOccupant} className="btn-secondary">
                        Cancel
                      </button>
                    )}
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
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            <span className={`badge badge-${occ.is_active ? 'active' : 'inactive'}`}>
                              {occ.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <button 
                              onClick={() => editOccupant(occ)}
                              className="btn-small"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => deleteOccupant(occ.id)}
                              className="btn-small"
                              style={{background: '#ef4444'}}
                            >
                              Delete
                            </button>
                          </div>
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
                      placeholder="Period (e.g. Jan 2024) *"
                      required
                    />
                    <input
                      type="number"
                      value={invAmount}
                      onChange={(e) => setInvAmount(e.target.value)}
                      placeholder="Amount (₹) *"
                      min="1"
                      required
                    />
                    <input
                      type="date"
                      value={invDueDate}
                      onChange={(e) => setInvDueDate(e.target.value)}
                      required
                    />
                    <button onClick={createInvoice}>
                      {editingInvoiceId ? "Update" : "Create"} Invoice
                    </button>
                    {editingInvoiceId && (
                      <button onClick={cancelEditInvoice} className="btn-secondary">
                        Cancel
                      </button>
                    )}
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
                              <th>Actions</th>
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
                                  <div style={{display: 'flex', gap: '4px'}}>
                                    <button
                                      onClick={() => editInvoice(inv)}
                                      className="btn-small"
                                    >
                                      Edit
                                    </button>
                                    {inv.status !== "paid" ? (
                                      <button
                                        onClick={() => markPaid(inv.id)}
                                        className="btn-small"
                                        style={{background: '#10b981'}}
                                      >
                                        Mark Paid
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => markUnpaid(inv.id)}
                                        className="btn-small"
                                        style={{background: '#f59e0b'}}
                                      >
                                        Mark Unpaid
                                      </button>
                                    )}
                                    <button
                                      onClick={() => deleteInvoice(inv.id)}
                                      className="btn-small"
                                      style={{background: '#ef4444'}}
                                    >
                                      Delete
                                    </button>
                                  </div>
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