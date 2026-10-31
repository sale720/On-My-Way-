# النشر والتشغيل

## التشغيل المحلي (تطوير)
```bash
cp .env.example .env            # APP_ENV=development، DATABASE_URL لقاعدة تطوير، AUTH_SECRET ≥ 32 حرفاً
npm ci
npx prisma migrate dev          # يطبّق الترحيلات على قاعدة التطوير
npm run dev
```
رمز الدخول يظهر في سجل الخادم: `[DEV SMS — not delivered] to=+9665… body=…`.

أول مدير منصة (بعد تسجيل دخوله مرة واحدة):
```bash
npm run admin:grant -- 05XXXXXXXX "سبب المنح"
```

## بيئة الاختبار (منفصلة)
أنشئ `.env.test` (غير مُتتبَّع في git):
```
APP_ENV=test
DATABASE_URL="postgresql://USER:PASS@localhost:5432/omw_test?schema=public"   # يجب أن يحتوي الاسم على test
AUTH_SECRET="<32+ حرفاً>"
SMS_PROVIDER=memory
```
```bash
npm test                        # يطبّق الترحيلات على قاعدة الاختبار ثم vitest
npm run build && npm run test:e2e
```

## الترحيلات (Migrations)
- التطوير: `prisma migrate dev`.
- الاختبار/الإنتاج: `prisma migrate deploy` فقط (لا يحذف بيانات، يطبّق الترحيلات المعلّقة بالترتيب).
- ممنوع `migrate reset` أو `db push --force-reset` خارج قاعدة تطوير محلية فارغة.

## الإنتاج
**غير جاهز بعد**: يتطلب مزوّد SMS حقيقياً (انظر INTEGRATIONS)، استضافة PostgreSQL مُدارة مع نسخ احتياطي، Proxy يضبط `X-Forwarded-For`، وترويسات الأمان. لم يُنشر أي إصدار.

## CI
`.github/workflows/ci.yml`: PostgreSQL 16 حقيقي → lint → typecheck → unit/integration → build → e2e (Playwright).
