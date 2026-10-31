# المعمارية التقنية (حالة المرحلة 1)

**النمط:** Modular Monolith على Next.js 15 (App Router). منطق الأعمال مستقل عن الواجهة.

```
src/
  app/                  ← الواجهة (Server Components) + Server Actions (actions.ts) — طبقة رقيقة
  i18n/                 ← قواميس ar/en واتجاه RTL/LTR
  server/
    env.ts              ← التحقق من الإعدادات (zod)، يرفض الإعدادات غير الآمنة
    db.ts               ← Prisma client
    logger.ts           ← سجلات JSON مع إخفاء الأسرار وتمويه الأرقام
    errors.ts           ← AppError برموز ثابتة تُترجم في الواجهة
    auth/               ← OTP، الجلسات، تطبيع الأرقام، سياسة الأمان
    rbac/               ← مصفوفة الصلاحيات + بوابات التفويض (منصة/منشأة)
    users/              ← الملف الشخصي، إدارة المستخدمين والأدوار
    salons/             ← المنشآت والعضويات (عزل المستأجرين)
    audit/              ← سجل التدقيق
    sms/                ← واجهة مزوّد SMS (console للتطوير / memory للاختبار)
    web.ts              ← ربط الطلب: الكوكي → المستخدم، اللغة، تغليف الأخطاء
prisma/                 ← المخطط + الترحيلات (migrations)
tests/                  ← unit / integration (PostgreSQL حقيقي) / e2e (Playwright)
scripts/grant-admin.ts  ← تهيئة أول مدير منصة
```

## مسار الطلب
1. الكوكي `omw_session` (httpOnly, SameSite=Lax, Secure في الإنتاج) يحمل رمزاً عشوائياً 256-bit.
2. `resolveSession` يحسب sha256 للرمز ويطابقه مع `Session.tokenHash` **في كل طلب**، ويتحقق من عدم الإلغاء/الانتهاء وأن المستخدم `ACTIVE`.
3. كل خدمة تستدعي `requirePlatformPermission` أو `requireSalonPermission` قبل أي قراءة أو كتابة. إخفاء الأزرار في الواجهة تلميح فقط.
4. التغييرات الحساسة + سجل التدقيق تُكتب في **نفس المعاملة (transaction)**.
5. تعديل أعضاء المنشأة يعمل في معاملة `Serializable` لمنع حذف آخر مالكة عبر طلبات متزامنة.

## الفصل بين البيئات
| البيئة | قاعدة البيانات | SMS |
|---|---|---|
| development | `omw_development` | `console` (يطبع الرمز في سجل الخادم) |
| test | `omw_test` (منفصلة، شرط الاسم `test`) | `memory` / `console` في e2e |
| production | غير مُعدّة بعد | **يرفض التشغيل** حتى يُدمج مزوّد حقيقي |
