import type { AppLocale } from "./dictionaries";

const ar = {
  nav: { book: "احجزي خدمة", bookings: "حجوزاتي", notifications: "الإشعارات", addresses: "عناويني" },
  common: { save: "حفظ", add: "إضافة", delete: "حذف", enable: "تفعيل", disable: "تعطيل", active: "مفعّل", inactive: "معطّل", reason: "السبب", minutes: "دقيقة", none: "لا يوجد", back: "رجوع" },
  address: {
    title: "عناويني", add: "إضافة عنوان", label: "اسم العنوان (اختياري)", district: "الحي", street: "الشارع والتفاصيل", building: "رقم المبنى",
    floor: "الدور/الشقة", instructions: "تعليمات الوصول", empty: "لا توجد عناوين محفوظة.", noDistricts: "لا توجد أحياء مفعّلة بعد. تُضاف من لوحة الإدارة.",
    privacy: "يُعرض الحي فقط لمقدمة الخدمة حتى يتم تأكيد الحجز.",
  },
  book: {
    title: "احجزي خدمة", address: "العنوان", category: "الفئة", search: "بحث", needAddress: "أضيفي عنواناً أولاً.", noOffers: "لا توجد خيارات متاحة لعنوانك في هذه الفئة حالياً.",
    excluded: "خيارات غير متاحة لعنوانك", earliest: "أقرب موعد", subtotal: "سعر الخدمة", travelFee: "رسوم الانتقال", vat: "ضريبة القيمة المضافة", total: "الإجمالي المتوقع",
    choose: "اختيار", chooseDate: "اختاري اليوم", chooseTime: "اختاري الوقت", noSlots: "لا توجد مواعيد متاحة في هذا اليوم.", confirmTitle: "مراجعة وتأكيد الحجز",
    paymentMethod: "وسيلة الدفع", notes: "ملاحظات لمقدمة الخدمة (اختياري)", confirm: "تأكيد طلب الحجز", ratingNone: "لا تقييمات بعد", reviews: "تقييم",
    afterSubmit: "يُرسل الطلب لمقدمة الخدمة للقبول. لن يُخصم أي مبلغ الآن.", noCategories: "لا توجد فئات مفعّلة بعد.",
  },
  booking: {
    number: "رقم الحجز", status: "الحالة", when: "الموعد", address: "العنوان", addressHidden: "يظهر العنوان الكامل بعد تأكيد الحجز", payment: "الدفع", history: "سجل الحالة",
    actions: "الإجراءات", customer: "العميلة", provider: "مقدمة الخدمة", salon: "المنشأة", recordCash: "تأكيد استلام المبلغ نقداً", reviewTitle: "قيّمي الخدمة", rating: "التقييم العام",
    punctuality: "الالتزام بالموعد", quality: "جودة الخدمة", comment: "تعليق", sendReview: "إرسال التقييم", yourReview: "تقييمك", empty: "لا توجد حجوزات.", system: "النظام", notes: "ملاحظات",
    reasonPlaceholder: "السبب (إلزامي لهذا الإجراء)", contact: "رقم التواصل",
    payNow: "إكمال الدفع", payDue: "أكملي الدفع قبل", refund: "الاسترداد", refundStatus: { PENDING: "قيد المعالجة", SUCCEEDED: "تم", FAILED: "فشل" } as Record<string, string>,
    sandboxPayment: "دفع تجريبي — لم تُنقل أموال حقيقية",
  },
  sandbox: {
    banner: "بوابة دفع تجريبية (Sandbox): لا تُخصم أي أموال ولا تُحفظ بيانات البطاقة. للتجربة فقط.",
    title: "إتمام الدفع", cardNumber: "رقم البطاقة (تجريبية)", pay: "ادفع", approve: "موافقة على الدفع", decline: "رفض الدفع",
    testCards: "بطاقات الاختبار", approved: "تتم الموافقة", declined: "يُرفض الدفع", noCardStored: "لا يُخزَّن رقم البطاقة.",
    closed: "عملية الدفع هذه لم تعد مفتوحة.",
  },
  transitions: {
    CONFIRMED: "قبول الطلب", REJECTED: "رفض الطلب", CANCELLED: "إلغاء الحجز", PROVIDER_EN_ROUTE: "أنا في الطريق", PROVIDER_ARRIVED: "وصلت", IN_PROGRESS: "بدء الخدمة",
    COMPLETED: "إكمال الخدمة", NO_SHOW: "العميلة لم تحضر", DISPUTED: "فتح نزاع", REFUND_PENDING: "طلب استرداد", REFUNDED: "تم الاسترداد", PARTIALLY_REFUNDED: "استرداد جزئي",
  } as Record<string, string>,
  status: {
    DRAFT: "مسودة", PENDING_AVAILABILITY_CHECK: "تحقق التوافر", PENDING_PROVIDER_ACCEPTANCE: "بانتظار قبول مقدمة الخدمة", PENDING_PAYMENT: "بانتظار الدفع", CONFIRMED: "مؤكد",
    ASSIGNED: "مُسند", PROVIDER_EN_ROUTE: "مقدمة الخدمة في الطريق", PROVIDER_ARRIVED: "وصلت مقدمة الخدمة", IN_PROGRESS: "قيد التنفيذ", COMPLETED: "مكتمل", CANCELLED: "ملغى",
    REJECTED: "مرفوض", NO_SHOW: "لم تحضر العميلة", DISPUTED: "نزاع", REFUND_PENDING: "استرداد قيد المعالجة", REFUNDED: "مسترد", PARTIALLY_REFUNDED: "مسترد جزئياً",
  } as Record<string, string>,
  pay: {
    CASH: "نقداً عند الزيارة", MADA: "مدى", CARD: "بطاقة ائتمانية (Visa / Mastercard)", APPLE_PAY: "Apple Pay", STC_PAY: "STC Pay", TABBY: "تابي (قسّمها)", TAMARA: "تمارا (ادفع لاحقاً)",
  } as Record<string, string>,
  payState: {
    AVAILABLE: "متاح", SANDBOX: "تجريبي — بدون أموال حقيقية", NOT_INTEGRATED: "غير مفعّل — يتطلب ربط بوابة الدفع", DISABLED_BY_PLATFORM: "معطّل من المنصة", DISABLED_BY_SALON: "معطّل من المنشأة",
  } as Record<string, string>,
  payStatus: { PENDING: "بانتظار الدفع", AUTHORIZED: "مفوَّض", PAID: "مدفوع", FAILED: "فشل", REFUNDED: "مسترد", PARTIALLY_REFUNDED: "مسترد جزئياً", VOIDED: "ملغى" } as Record<string, string>,
  payRequires: {
    gateway: "حساب تاجر لدى بوابة دفع سعودية + ربط تقني", "gateway+apple_merchant": "بوابة دفع + حساب Apple Pay Merchant", bnpl_contract: "عقد مع مزوّد التقسيط + ربط تقني",
  } as Record<string, string>,
  reasons: {
    SALON_NOT_ACTIVE: "المنشأة غير معتمدة حالياً", SERVICE_INACTIVE: "الخدمة متوقفة", OUT_OF_SALON_AREA: "العنوان خارج نطاق المنشأة", NO_STAFF_FOR_SERVICE: "لا توجد مقدمة خدمة لهذه الخدمة",
    NO_STAFF_COVERS_AREA: "لا توجد مقدمة خدمة تغطي حيّك", NO_STAFF_SCHEDULE: "لا يوجد جدول عمل", NO_AVAILABILITY: "لا مواعيد متاحة خلال الفترة القادمة",
  } as Record<string, string>,
  salon: {
    tabs: { overview: "نظرة عامة", services: "الخدمات", coverage: "التغطية", staff: "الفريق والجداول", bookings: "الحجوزات", settings: "الإعدادات والدفع" },
    services: "الخدمات", addService: "إضافة خدمة", category: "الفئة", nameAr: "الاسم بالعربية", nameEn: "الاسم بالإنجليزية", duration: "المدة (دقيقة)", price: "السعر (ريال)",
    coverage: "مناطق التغطية", addDistrict: "إضافة/تعديل حي", travelFee: "رسوم الانتقال (ريال)", coverageNote: "تعديل التغطية لا يلغي الحجوزات المؤكدة.",
    staffTitle: "الفريق", skills: "الخدمات التي تقدمها", myCoverage: "الأحياء التي تصل إليها", schedule: "جدول العمل الأسبوعي", from: "من", to: "إلى", dayOff: "يوم إجازة",
    addDayOff: "إضافة إجازة", scheduleHint: "اتركي الحقلين فارغين ليوم بلا عمل. التوقيت: الرياض.", policy: "سياسات التشغيل", travelBuffer: "وقت الانتقال قبل كل زيارة (دقيقة)",
    minNotice: "أقل مهلة قبل الموعد (دقيقة)", maxAdvance: "أقصى مدة للحجز المسبق (يوم)", cancelWindow: "الإلغاء المجاني قبل الموعد (ساعة)", acceptTimeout: "مهلة قبول الطلب (دقيقة)",
    paymentMethods: "وسائل الدفع", bookings: "الحجوزات", manage: "إدارة", noServices: "لا توجد خدمات.", noCoverage: "لا توجد مناطق تغطية.",
  },
  weekdays: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  admin: {
    links: { home: "المستخدمون والمنشآت", catalog: "الكتالوج والمناطق", settings: "الرسوم ووسائل الدفع", report: "التقارير" },
    categories: "فئات الخدمات", slug: "المعرّف (إنجليزي)", sortOrder: "الترتيب", addCategory: "إضافة فئة", cities: "المدن والأحياء", nameAr: "الاسم بالعربية", nameEn: "الاسم بالإنجليزية",
    addCity: "إضافة مدينة", addDistrict: "إضافة حي", city: "المدينة", settings: "الإعدادات التجارية", commission: "عمولة المنصة (%)", vat: "ضريبة القيمة المضافة (%)",
    settingsNote: "القيم الافتراضية صفر: لا تُحتسب عمولة أو ضريبة حتى تُضبط هنا. التغيير يسري على الحجوزات الجديدة فقط.", paymentMethods: "وسائل الدفع على المنصة",
    paymentNote: "جميع الوسائل مضافة ومرئية. الوسائل الإلكترونية تبقى غير مفعّلة حتى يُربط مزوّد الدفع (لا توجد مدفوعات وهمية).", requires: "المطلوب للتفعيل",
    report: "تقرير المنصة", gmv: "قيمة الحجوزات المكتملة", commissionTotal: "العمولات (مكتملة)", cash: "النقد المستلم", last30: "حجوزات آخر 30 يوماً", completion: "نسبة الإكمال",
    activeSalons: "منشآت نشطة", users: "المستخدمون", byStatus: "الحجوزات حسب الحالة", definitions: "تعريفات المؤشرات في docs/PRICING_AND_COMMISSIONS.md",
  },
  notif: {
    title: "الإشعارات", markRead: "تعليم الكل كمقروء", empty: "لا توجد إشعارات.", channel: "داخل التطبيق فقط (القنوات الخارجية غير مربوطة بعد)",
    types: {
      "booking.requested": "طلب حجز جديد", "booking.confirmed": "تم قبول حجزك", "booking.rejected": "تم رفض طلب الحجز", "booking.cancelled": "تم إلغاء حجز",
      "booking.provider_en_route": "مقدمة الخدمة في الطريق", "booking.provider_arrived": "وصلت مقدمة الخدمة", "booking.in_progress": "بدأت الخدمة", "booking.completed": "اكتملت الخدمة — قيّمي تجربتك",
      "booking.no_show": "سُجّل عدم حضور", "booking.disputed": "فُتح نزاع على حجز", "booking.expired": "انتهت مهلة طلبك وأُلغي", "review.created": "تقييم جديد",
      "payment.paid": "تم الدفع (تجريبي) وأُرسل الطلب لمقدمة الخدمة", "payment.failed": "فشل الدفع وأُلغي الطلب", "payment.refunded": "تم استرداد المبلغ",
    } as Record<string, string>,
  },
};

export type Dict2 = typeof ar;

const en: Dict2 = {
  nav: { book: "Book a service", bookings: "My bookings", notifications: "Notifications", addresses: "My addresses" },
  common: { save: "Save", add: "Add", delete: "Delete", enable: "Enable", disable: "Disable", active: "Active", inactive: "Inactive", reason: "Reason", minutes: "min", none: "None", back: "Back" },
  address: {
    title: "My addresses", add: "Add address", label: "Label (optional)", district: "District", street: "Street & details", building: "Building no.",
    floor: "Floor/apartment", instructions: "Access instructions", empty: "No saved addresses.", noDistricts: "No districts are active yet. They are added from the admin panel.",
    privacy: "Only the district is shown to the provider until the booking is confirmed.",
  },
  book: {
    title: "Book a service", address: "Address", category: "Category", search: "Search", needAddress: "Add an address first.", noOffers: "No options are available for your address in this category right now.",
    excluded: "Options not available at your address", earliest: "Earliest", subtotal: "Service price", travelFee: "Travel fee", vat: "VAT", total: "Expected total",
    choose: "Choose", chooseDate: "Pick a day", chooseTime: "Pick a time", noSlots: "No times available on this day.", confirmTitle: "Review & confirm",
    paymentMethod: "Payment method", notes: "Notes for the provider (optional)", confirm: "Send booking request", ratingNone: "No ratings yet", reviews: "reviews",
    afterSubmit: "The request goes to the provider for acceptance. Nothing is charged now.", noCategories: "No active categories yet.",
  },
  booking: {
    number: "Booking no.", status: "Status", when: "When", address: "Address", addressHidden: "Full address is shown once the booking is confirmed", payment: "Payment", history: "Status history",
    actions: "Actions", customer: "Customer", provider: "Provider", salon: "Salon", recordCash: "Confirm cash received", reviewTitle: "Rate the service", rating: "Overall rating",
    punctuality: "Punctuality", quality: "Quality", comment: "Comment", sendReview: "Submit review", yourReview: "Your review", empty: "No bookings.", system: "System", notes: "Notes",
    reasonPlaceholder: "Reason (required for this action)", contact: "Contact number",
    payNow: "Complete payment", payDue: "Complete payment before", refund: "Refund", refundStatus: { PENDING: "Processing", SUCCEEDED: "Done", FAILED: "Failed" },
    sandboxPayment: "Sandbox payment — no real money moved",
  },
  sandbox: {
    banner: "Sandbox payment gateway: no money is charged and no card data is stored. Testing only.",
    title: "Complete payment", cardNumber: "Card number (test)", pay: "Pay", approve: "Approve payment", decline: "Decline payment",
    testCards: "Test cards", approved: "approved", declined: "declined", noCardStored: "The card number is not stored.",
    closed: "This payment is no longer open.",
  },
  transitions: {
    CONFIRMED: "Accept request", REJECTED: "Reject request", CANCELLED: "Cancel booking", PROVIDER_EN_ROUTE: "I'm on my way", PROVIDER_ARRIVED: "I've arrived", IN_PROGRESS: "Start service",
    COMPLETED: "Complete service", NO_SHOW: "Customer no-show", DISPUTED: "Open dispute", REFUND_PENDING: "Request refund", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially refunded",
  },
  status: {
    DRAFT: "Draft", PENDING_AVAILABILITY_CHECK: "Checking availability", PENDING_PROVIDER_ACCEPTANCE: "Awaiting provider acceptance", PENDING_PAYMENT: "Awaiting payment", CONFIRMED: "Confirmed",
    ASSIGNED: "Assigned", PROVIDER_EN_ROUTE: "Provider en route", PROVIDER_ARRIVED: "Provider arrived", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled",
    REJECTED: "Rejected", NO_SHOW: "No-show", DISPUTED: "Disputed", REFUND_PENDING: "Refund pending", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially refunded",
  },
  pay: { CASH: "Cash on visit", MADA: "mada", CARD: "Credit card (Visa / Mastercard)", APPLE_PAY: "Apple Pay", STC_PAY: "STC Pay", TABBY: "Tabby (split it)", TAMARA: "Tamara (pay later)" },
  payState: { AVAILABLE: "Available", SANDBOX: "Sandbox — no real money", NOT_INTEGRATED: "Not active — requires payment-gateway integration", DISABLED_BY_PLATFORM: "Disabled by platform", DISABLED_BY_SALON: "Disabled by salon" },
  payStatus: { PENDING: "Pending", AUTHORIZED: "Authorized", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially refunded", VOIDED: "Voided" },
  payRequires: {
    gateway: "Merchant account with a Saudi payment gateway + integration", "gateway+apple_merchant": "Payment gateway + Apple Pay merchant account", bnpl_contract: "BNPL provider contract + integration",
  },
  reasons: {
    SALON_NOT_ACTIVE: "Salon not approved", SERVICE_INACTIVE: "Service paused", OUT_OF_SALON_AREA: "Address outside the salon's area", NO_STAFF_FOR_SERVICE: "No provider offers this service",
    NO_STAFF_COVERS_AREA: "No provider covers your district", NO_STAFF_SCHEDULE: "No working hours set", NO_AVAILABILITY: "No free times in the coming period",
  },
  salon: {
    tabs: { overview: "Overview", services: "Services", coverage: "Coverage", staff: "Team & schedules", bookings: "Bookings", settings: "Settings & payments" },
    services: "Services", addService: "Add service", category: "Category", nameAr: "Arabic name", nameEn: "English name", duration: "Duration (min)", price: "Price (SAR)",
    coverage: "Coverage areas", addDistrict: "Add/update district", travelFee: "Travel fee (SAR)", coverageNote: "Changing coverage never cancels confirmed bookings.",
    staffTitle: "Team", skills: "Services she performs", myCoverage: "Districts she can reach", schedule: "Weekly schedule", from: "From", to: "To", dayOff: "Day off",
    addDayOff: "Add day off", scheduleHint: "Leave both fields empty for a non-working day. Times are Riyadh time.", policy: "Operating policy", travelBuffer: "Travel time before each visit (min)",
    minNotice: "Minimum notice (min)", maxAdvance: "Max advance booking (days)", cancelWindow: "Free cancellation before start (hours)", acceptTimeout: "Request acceptance timeout (min)",
    paymentMethods: "Payment methods", bookings: "Bookings", manage: "Manage", noServices: "No services.", noCoverage: "No coverage areas.",
  },
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  admin: {
    links: { home: "Users & salons", catalog: "Catalog & areas", settings: "Fees & payment methods", report: "Reports" },
    categories: "Service categories", slug: "Slug (English)", sortOrder: "Order", addCategory: "Add category", cities: "Cities & districts", nameAr: "Arabic name", nameEn: "English name",
    addCity: "Add city", addDistrict: "Add district", city: "City", settings: "Commercial settings", commission: "Platform commission (%)", vat: "VAT (%)",
    settingsNote: "Defaults are zero: no commission or VAT is charged until set here. Changes apply to new bookings only.", paymentMethods: "Platform payment methods",
    paymentNote: "All methods are added and visible. Online methods stay inactive until a payment provider is integrated (no simulated payments).", requires: "Needed to activate",
    report: "Platform report", gmv: "Completed booking value", commissionTotal: "Commission (completed)", cash: "Cash collected", last30: "Bookings, last 30 days", completion: "Completion rate",
    activeSalons: "Active salons", users: "Users", byStatus: "Bookings by status", definitions: "Metric definitions in docs/PRICING_AND_COMMISSIONS.md",
  },
  notif: {
    title: "Notifications", markRead: "Mark all as read", empty: "No notifications.", channel: "In-app only (external channels not connected yet)",
    types: {
      "booking.requested": "New booking request", "booking.confirmed": "Your booking was accepted", "booking.rejected": "Booking request rejected", "booking.cancelled": "A booking was cancelled",
      "booking.provider_en_route": "Your provider is on the way", "booking.provider_arrived": "Your provider has arrived", "booking.in_progress": "Service started", "booking.completed": "Service completed — rate your experience",
      "booking.no_show": "No-show recorded", "booking.disputed": "A dispute was opened", "booking.expired": "Your request expired and was cancelled", "review.created": "New review",
      "payment.paid": "Payment received (sandbox); request sent to the provider", "payment.failed": "Payment failed; request cancelled", "payment.refunded": "Amount refunded",
    },
  },
};

export const dict2: Record<AppLocale, Dict2> = { ar, en };
