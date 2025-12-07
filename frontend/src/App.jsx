import { useState, useEffect } from "react";
import "./App.css";

export default function App() {
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("mobile"); // "mobile" | "otp" | "apartment"
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking...");

  // Apartment form
  const [aptName, setAptName] = useState("");
  const [aptCity, setAptCity] = useState("");
  const [aptUnits, setAptUnits] = useState("");
  const [aptMessage, setAptMessage] = useState("");
  const [createdApartments, setCreatedApartments] = useState([]);

  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  // Call /health when app loads
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
    } catch (e) {
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

      // Instead of alert, move to apartment onboarding step
      setStep("apartment");
      setAptMessage("OTP verified! Let’s onboard your apartment.");
      // Optionally load existing apartments
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
        // If user has no apartments yet, it's okay
        setCreatedApartments([]);
        return;
      }
      const data = await res.json();
      setCreatedApartments(data.apartments || []);
    } catch {
      // ignore errors here for now
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
              Welcome, +91 {mobile}. Let’s onboard your apartment.
            </p>

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

            {createdApartments.length > 0 && (
              <div className="apt-list">
                <h4>Your apartments</h4>
                <ul>
                  {createdApartments.map((apt) => (
                    <li key={apt.id}>
                      <strong>{apt.name}</strong> – {apt.city} ({apt.total_units} units)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {aptMessage && <p className="info">{aptMessage}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
