# On-My-Way-
منصة لإدارة حجوزات ومواعيد العملاء وتقييماتهم، وإدارة خدمات مقدّمي الخدمة المنزلية في مجال الصالونات النسائية، مع إمكانية التوسّع في مجالات أخرى.

**الحالة (0.4.0):** المرحلتان 1 و2 مكتملتان ومختبرتان: الحسابات والصلاحيات، المنشآت، الكتالوج والتغطية، الحجز، الدفع النقدي، **والدفع الإلكتروني وSMS في الوضع التجريبي** (بلا أموال أو رسائل حقيقية). التفاصيل في [`docs/ROADMAP.md`](docs/ROADMAP.md).

## طريقة العمل (بناء تدريجي)
كل ميزة أو تعديل: فرع جديد ← طلب دمج (Pull Request) يشغّل كل الاختبارات تلقائياً (CI) ← تجربة في Codespaces على الفرع ← مراجعة المالك ← دمج في `main`. الفرع `main` هو دائماً آخر نسخة مختبرة.

## جرّبها الآن (داخل GitHub، بلا سيرفرات)
**Code ← Codespaces ← Create codespace**، ثم اتبع [`docs/TRY_IT.md`](docs/TRY_IT.md). الوضع تجريبي: لا رسائل SMS حقيقية ولا أموال حقيقية.

## الوثائق
- **المرجع الأعلى للمتطلبات:** [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md)
- المعمارية: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · القرارات: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- الأدوار والصلاحيات: [`docs/USER_ROLES_AND_PERMISSIONS.md`](docs/USER_ROLES_AND_PERMISSIONS.md)
- نموذج البيانات: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) · الأمن: [`docs/SECURITY_AND_PRIVACY.md`](docs/SECURITY_AND_PRIVACY.md)
- الاختبارات ونتائجها: [`docs/TEST_STRATEGY.md`](docs/TEST_STRATEGY.md) · النشر: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- دورة الحجز: [`docs/BOOKING_LIFECYCLE.md`](docs/BOOKING_LIFECYCLE.md) · التغطية: [`docs/GEO_COVERAGE_ENGINE.md`](docs/GEO_COVERAGE_ENGINE.md) · التسعير والدفع: [`docs/PRICING_AND_COMMISSIONS.md`](docs/PRICING_AND_COMMISSIONS.md)
- التكاملات: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) · القيود: [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) · [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
- مسودة المواصفات الأولى (متجاوزة): [`docs/SPEC.md`](docs/SPEC.md)

## التشغيل محلياً
المتطلبات: Node 22، PostgreSQL 16.
```bash
cp .env.example .env              # اضبط DATABASE_URL و AUTH_SECRET
npm ci
npx prisma migrate dev
npm run dev                       # رمز الدخول يظهر في سجل الخادم (بيئة التطوير)
npm run admin:grant -- 05XXXXXXXX "السبب"   # أول مدير منصة، بعد تسجيل دخوله مرة
```

## الاختبارات (قاعدة بيانات منفصلة)
```bash
# .env.test: APP_ENV=test و DATABASE_URL لقاعدة اسمها يحتوي "test" — انظر docs/DEPLOYMENT.md
npm test                          # unit + integration على PostgreSQL حقيقي
npm run build && npm run test:e2e # end-to-end بمتصفح حقيقي
```

**التقنيات:** Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 · Prisma 6 · PostgreSQL 16 · Vitest · Playwright
