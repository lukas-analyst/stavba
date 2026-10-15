"use client";
import { reportError } from "@/lib/error-reporting";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error, { source: "global-error-boundary" });
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Něco se pokazilo</h2>
          <p>Aplikace narazila na neočekávanou chybu.</p>
          <button onClick={() => reset()}>Zkusit znovu</button>
        </div>
      </body>
    </html>
  );
}
