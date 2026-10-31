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

## مؤجّل للمرحلة 2 وما بعدها
الكتالوج، العناوين، التغطية الجغرافية، التوافر، الحجوزات، التقييمات، المدفوعات (انظر المرجع §19). سيُضاف كل منها بترحيل جديد **إضافي** (additive) دون تعديل مدمّر على الجداول الحالية.
