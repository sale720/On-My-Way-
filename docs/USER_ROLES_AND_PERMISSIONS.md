# الأدوار والصلاحيات (المنفّذ فعلياً في المرحلة 1)

المصدر الوحيد للحقيقة: `src/server/rbac/permissions.ts`. التنفيذ على الخادم في `src/server/rbac/authorize.ts`.

## أدوار المنصة (`PlatformRoleAssignment`)
| الصلاحية | CUSTOMER | PROVIDER | SUPPORT_AGENT | PLATFORM_ADMIN |
|---|:-:|:-:|:-:|:-:|
| customer.profile.manage | ✓ | ✓ | ✓ | ✓ |
| salon.create | ✓ | ✓ | – | ✓ |
| platform.users.read | – | – | ✓ (أرقام مموّهة) | ✓ |
| platform.users.manage | – | – | – | ✓ |
| platform.roles.manage | – | – | – | ✓ |
| platform.salons.read | – | – | ✓ (قراءة فقط) | ✓ |
| platform.salons.manage | – | – | – | ✓ |
| platform.audit.read | – | – | – | ✓ |

كل مستخدم جديد يحصل على `CUSTOMER` تلقائياً.

## أدوار المنشأة (`SalonMembership.role`)
| الصلاحية | OWNER | MANAGER | STAFF |
|---|:-:|:-:|:-:|
| salon.profile.read | ✓ | ✓ | ✓ |
| salon.profile.manage | ✓ | – | – |
| salon.members.read | ✓ | ✓ | – |
| salon.members.manage | ✓ | ✓ (لا يمنح/يعدّل OWNER) | – |

## قواعد إضافية مُنفّذة ومختبرة
- غير العضو (أو العضو المعطّل) يحصل على `NOT_FOUND` — لا يُكشف وجود المنشأة.
- معرّف عضوية من منشأة أخرى لا يمكن تعديله عبر منشأتك (الاستعلام مقيّد بـ `salonId`).
- لا يمكن تعطيل أو تخفيض آخر مالكة نشطة (`LAST_OWNER`).
- المدير لا يستطيع تعليق نفسه أو سحب دور `PLATFORM_ADMIN` من نفسه.
- تعليق مستخدم يلغي جميع جلساته فوراً.
- كل تغيير حالة/دور يتطلب سبباً (3 أحرف على الأقل) ويُسجَّل في `AuditLog`.
