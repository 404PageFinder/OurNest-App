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
  const [createdApartments, setCreatedApartments] = useState([]);

  // Selected apartment for unit management
  const [selectedApartmentId, setSelectedApartmentId] = useState(null);
  const [selectedApartmentName, setSelectedApartmentName] = useState("");

  // Units form + list
  const [units, setUnits] = useState([]);
  const [unitNumber, setUnitNumber] = useState("");
  const [bhkType, setBhkType] = useState("2BHK");
  const [unitStatus, setUnitStatus] = useState("vacant");

  const [infoMessage, setInfoMessage] = useState("");

  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  // Check backend status
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
    setInfoMessage("");

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
    } catch (e) {
      setError("Could not reach server. Is backend running?");
    }
  };

  const verifyOtp = async () => {
    setError("");
    setInfoMessage("");

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
      setInfoMessage("OTP verified! Let’s onboard your apartment.");
      fetchApartments();
    } catch (e) {
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
    setInfoMessage("");

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

      setInfoMessage(`Apartment "${data.name}" created successfully!`);
      setAptName("");
      setAptCity("");
      setAptUnits("");
      fetchApartments();
    } catch (e) {
      setError("Could not reach server. Is backend running?");
    }
  };

  const selectApartment = async (apt) => {
    setSelectedApartmentId(apt.id);
    setSelectedApartmentName(`${apt.name} (${apt.city})`);
    setInfoMessage("");
    setError("");
    setUnitNumber("");
    setBhkType("2BHK");
    setUnitStatus("vacant");
    await fetchUnits(apt.id);
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
    if (!selectedApartmentId) return;

    setError("");
    setInfoMessage("");

    try {
      const res = await fetch(
        `http://localhost:8000/apartments/${selectedApartmentId}/units`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mobile,
            unit_number: unitNumber,
            bhk_type: bhkType,
            status: unitStatus,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Could not create unit.");
        return;
      }

      setInfoMessage(
        `Unit ${data.unit_number} (${data.bhk_type}, ${data.status}) added to ${selectedApartmentName}.`
      );
      setUnitNumber("");
      setBhkType("2BHK");
      setUnitStatus("vacant");
      fetchUnits(selectedApartmentId);
    } catch (e) {
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

        {/* STEP 1: Mobile */}
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

        {/* STEP 2: OTP */}
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

        {/* STEP 3: Apartment + Units */}
        {step === "apartment" && (
          <>
            <p className="welcome-text">
              Welcome, +91 {mobile}. Let’s onboard your apartment and units.
            </p>

            {/* Apartment creation */}
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

            {/* Apartment list */}
            {createdApartments.length > 0 && (
              <div className="apt-list">
                <h4>Your apartments</h4>
                <ul>
                  {createdApartments.map((apt) => (
                    <li key={apt.id}>
                      <button
                        className={
                          selectedApartmentId === apt.id
                            ? "apt-button selected"
                            : "apt-button"
                        }
                        onClick={() => selectApartment(apt)}
                      >
                        <strong>{apt.name}</strong> – {apt.city} (
                        {apt.total_units} units)
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Units section for selected apartment */}
            {selectedApartmentId && (
              <div className="unit-section">
                <h4>Units in {selectedApartmentName}</h4>

                <div className="unit-form">
                  <input
                    placeholder="Unit number (e.g., 101)"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                  />

                  <select
                    value={bhkType}
                    onChange={(e) => setBhkType(e.target.value)}
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
                    disabled={!unitNumber || !bhkType || !unitStatus}
                  >
                    Add Unit
                  </button>
                </div>

                {/* Units list */}
                {units.length > 0 && (
                  <div className="unit-list">
                    <ul>
                      {units.map((u) => (
                        <li key={u.id}>
                          <span className="unit-pill">
                            {u.unit_number} • {u.bhk_type} •{" "}
                            {u.status === "vacant" ? "Vacant" : "Occupied"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {infoMessage && <p className="info">{infoMessage}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
