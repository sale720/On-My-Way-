# نموذج البيانات — المرحلة 1

المصدر: `prisma/schema.prisma`، الترحيل: `prisma/migrations/*_phase1_foundation`.

| الجدول | الدور |
|---|---|
| `User` | الهوية (رقم جوال E.164 فريد)، الاسم، اللغة المفضلة، الحالة (`ACTIVE`/`SUSPENDED`) |
| `PlatformRoleAssignment` | أدوار المنصة لكل مستخدم + من منحها؛ فريد (userId, role) |
| `Session` | جلسات الدخول؛ يُخزّن sha256 للرمز فقط، مع الانتهاء والإلغاء |
| `OtpChallenge` | رموز التحقق (مُجزّأة)، عدد المحاولات، الاستهلاك، IP الطالب (لحدود المعدل) |
| `Salon` | المنشأة (الصالون السحابي) — المستأجر (tenant)؛ الحالة `PENDING_REVIEW`/`ACTIVE`/`SUSPENDED` |
| `SalonMembership` | ربط مستخدم بمنشأة بدور (`OWNER`/`MANAGER`/`STAFF`) وحالة؛ فريد (salonId, userId) |
| `AuditLog` | سجل الإجراءات الحساسة: المنفّذ، الإجراء، الهدف، المنشأة، السبب، تفاصيل JSON |

```
User 1─* PlatformRoleAssignment
User 1─* Session
User 1─* SalonMembership *─1 Salon
User 1─* AuditLog *─0..1 Salon
```

## المرحلة 2 (ترحيل `phase2_operational_mvp` — إضافي بالكامل)
| الجدول | الدور |
|---|---|
| `City`, `District` | المرجع الجغرافي (يديره مدير المنصة) |
| `ServiceCategory` | فئات الخدمات |
| `SalonService` | خدمة المنشأة: الاسم ar/en، المدة، السعر بالهللة، الحالة |
| `StaffService` | من تقدّم أي خدمة |
| `SalonCoverageArea` | نطاق المنشأة + رسوم الانتقال لكل حي |
| `StaffCoverage` | نطاق مقدمة الخدمة (ضمن نطاق المنشأة) |
| `AvailabilityRule`, `AvailabilityException` | ساعات العمل الأسبوعية وأيام الإجازة |
| `CustomerAddress` | عناوين العميلة (حذف ناعم) |
| `Booking`, `BookingItem`, `BookingStatusHistory` | الحجز ولقطاته وسجل حالاته |
| `Payment` | عمليات الدفع (`providerRef` فريد لمنع التكرار) |
| `PaymentMethodConfig`, `SalonPaymentMethod` | تفعيل وسائل الدفع على مستوى المنصة والمنشأة |
| `PlatformSetting` | الإعدادات التجارية (العمولة، الضريبة) |
| `Review` | تقييم واحد لكل حجز |
| `Notification` | إشعارات داخل التطبيق |

أعمدة جديدة على `Salon` (بقيم افتراضية): سياسات التشغيل الخمس.

### قيود على مستوى قاعدة البيانات
- `booking_no_overlap_per_provider` — `EXCLUDE USING gist` يمنع تداخل الحجوزات النشطة لنفس مقدمة الخدمة.
- CHECK: ترتيب أوقات الحجز، عدم سالبية المبالغ، التقييم 1–5، صحة ساعات العمل، حدود سياسات المنشأة، حدود مدة/سعر الخدمة.

## مؤجّل للمراحل التالية
الباقات، القسائم والعروض، التسويات والفواتير، الشكاوى، المخزون، الاشتراكات (انظر المرجع §19). تُضاف بترحيلات **إضافية** فقط دون تعديل مدمّر على الجداول الحالية.
