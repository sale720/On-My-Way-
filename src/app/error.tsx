"use client";

// Last-resort boundary. Details are logged server-side; nothing sensitive is shown here.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";
  return (
    <section className="flex flex-col gap-3 py-10">
      <h1 className="text-xl font-bold">{ar ? "حدث خطأ غير متوقع" : "Something went wrong"}</h1>
      <button onClick={reset} className="btn self-start">
        {ar ? "إعادة المحاولة" : "Try again"}
      </button>
    </section>
  );
}
