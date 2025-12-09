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

      // Go to apartment onboarding
      setStep("apartment");
      setAptMessage("OTP verified! Let’s onboard your apartment.");
      fetchApartments();
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
    } catch {
      setError("Could not reach server. Is backend running?");
    }
  };

  const handleSelectApartment = (apt) => {
    setSelectedApartmentId(apt.id);
    setSelectedApartmentName(apt.name);
    setUnitMessage("");
    setUnits([]);
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
    } catch {
      setError("Could not reach server. Is backend running?");
    }
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
              Welcome, +91 {mobile}. Onboard your apartment and units.
            </p>

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
                  Units for: {selectedApartmentName}
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
                  <button
                    onClick={createUnit}
                    disabled={!unitName}
                  >
                    Add Unit
                  </button>
                </div>

                {units.length > 0 && (
                  <ul className="unit-list">
                    {units.map((u) => (
                      <li key={u.id} className="unit-item">
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
          </>
        )}

        {aptMessage && <p className="info">{aptMessage}</p>}
        {unitMessage && <p className="info">{unitMessage}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
