# On-My-Way-
منصة لإدارة حجوزات ومواعيد العملاء وتقييماتهم، وإدارة خدمات مقدّمي الخدمة المنزلية في مجال الصالونات النسائية، مع إمكانية التوسّع في مجالات أخرى.

- **المرجع الأعلى للمتطلبات:** [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md)
- مسودة المواصفات الأولية: [`docs/SPEC.md`](docs/SPEC.md)
- نموذج البيانات: [`prisma/schema.prisma`](prisma/schema.prisma)

## التشغيل محلياً
```bash
cp .env.example .env        # عدّل DATABASE_URL
npm install
npx prisma migrate dev --name init
npm run dev
```

**التقنيات:** Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 · Prisma 6 · PostgreSQL
