'use client';

// The invoice itself is server-rendered (so it prints without waiting for JS and can be
// verified in the HTML); only the print action needs the browser.
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary !py-2">
      Print / Save PDF
    </button>
  );
}
