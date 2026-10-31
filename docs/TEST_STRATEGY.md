# استراتيجية الاختبارات ونتائجها الفعلية

## المستويات
| المستوى | الأداة | ما يغطيه | قاعدة البيانات |
|---|---|---|---|
| Unit | Vitest | تطبيع الأرقام، التحقق من الإعدادات، إخفاء الأسرار في السجلات، مصفوفة الصلاحيات | — |
| Integration | Vitest | خدمات الخادم كاملة (auth, rbac, users, salons, audit) | **PostgreSQL 16 حقيقي** (`omw_test`) |
| E2E | Playwright (Chromium) | تطبيق `next start` حقيقي + متصفح + قاعدة الاختبار | `omw_test` |

### ضمانات العزل
- `tests/setup.ts` يحمّل `.env.test` ويرفض التشغيل إن لم يكن `APP_ENV=test` واسم القاعدة يحتوي `test`.
- تفريغ الجداول بين الاختبارات (`TRUNCATE`) محصور بنفس الحارس.
- أرقام الجوال في الاختبارات اصطناعية (`+96650000…`)، لا بيانات أشخاص حقيقيين.

## الأوامر
```bash
npm test                          # unit + integration
npm run build && npm run test:e2e # end-to-end
```

## النتائج الفعلية — 2026-10-31 (بيئة التطوير المحلية، PostgreSQL 16.15، Node 22.23)

### Unit + Integration: **51/51 ناجحة**
```
✓ tests/integration/tenant-isolation.test.ts (10 tests)
✓ tests/integration/auth.test.ts (13 tests)
✓ tests/integration/rbac-admin.test.ts (8 tests)
✓ tests/unit/foundation.test.ts (20 tests)
Test Files  4 passed (4)
     Tests  51 passed (51)
```

### اختبار طفرة (للتأكد أن الاختبارات تكشف الأخطاء فعلاً)
عُطّل فحص العزل في `requireSalonPermission` عمداً (السماح لغير الأعضاء) → **فشلت 3 اختبارات عزل** كما هو متوقع → أُعيد الكود الأصلي.

### E2E: **12/12 ناجحة**
```
PASS  home renders in Arabic, RTL by default
PASS  user A signs up via OTP and lands on /account
PASS  an invalid OTP is rejected with a visible error
PASS  profile name is saved to the database
PASS  user A creates a salon and becomes OWNER
PASS  switching language flips to English/LTR and persists as the user's preference
PASS  data and session survive a full server restart
PASS  user B (other tenant) cannot open user A's salon or the admin page
PASS  operator CLI grants PLATFORM_ADMIN to B (audited)
PASS  admin B suspends A with a reason; A's session is revoked immediately
PASS  logout revokes the session server-side
PASS  secrets are not written to the server log in clear text
```
كل خطوة تتحقق من **قاعدة البيانات مباشرة** وليس من الواجهة فقط (مثلاً: الاسم المحفوظ يُقرأ من جدول `User`).

### أخطاء اكتُشفت وأُصلحت أثناء الاختبار
1. سكربت E2E كان يقتل `npx` دون عملية `next-server` الفرعية → إعادة التشغيل لم تكن حقيقية. أُصلح بتشغيل Next مباشرة؛ تأكدنا من عدم بقاء عمليات.
2. استخراج رمز OTP من السجل التقط أول 6 أرقام من رقم الجوال. أُصلح التعبير النمطي.
3. `role="alert"` يطابق عنصر إعلان التنقل الداخلي في Next.js؛ قُيّدت المحددات بالنموذج.

### نتيجة CI (GitHub Actions)
- **Run #1** على commit `afb380f` — [الرابط](https://github.com/sale720/On-My-Way-/actions/runs/41205254699): **success**.
  الخطوات: lint ✓ · typecheck ✓ · unit+integration على PostgreSQL 16 ✓ · build ✓ · E2E ✓ (السجل يُظهر سطور `PASS` الاثنتي عشرة).
- ملاحظات من سجل Run #1 أُصلحت في الـ commit التالي:
  1. فحص صحة PostgreSQL كان يتصل بقاعدة `omw` غير الموجودة (ضجيج `FATAL` في السجل، دون أثر على النتيجة) → أُضيف `-d omw_test`.
  2. سكربت E2E بقي معلّقاً ~57 ثانية بعد انتهاء الاختبارات بسبب مؤقّت لم يُلغَ → أُلغي المؤقّت؛ المدة المحلية الآن 14 ثانية.
