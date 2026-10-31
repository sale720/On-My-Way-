export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-bold">On My Way — في الطريق</h1>
      <p className="text-lg opacity-80">
        احجزي خدمات الصالون في منزلك: اختاري الخدمة، حدّدي الموعد، وقيّمي التجربة.
      </p>
      <div className="flex flex-wrap gap-3">
        <span className="rounded-full border px-4 py-2 text-sm">للعميلات: الحجز قريباً</span>
        <span className="rounded-full border px-4 py-2 text-sm">لمقدّمات الخدمة: التسجيل قريباً</span>
      </div>
    </main>
  );
}
