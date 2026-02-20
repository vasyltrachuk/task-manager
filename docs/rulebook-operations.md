# Rulebook Operations Runbook

Цей файл покриває запуск `init`, dry-run/real generation, щоденний cron і перевірку UI.

## 0. Передумови

У `.env.local` мають бути значення:

- `NEXT_PUBLIC_APP_URL` (наприклад, `http://localhost:3000` або production URL)
- `CRON_SECRET` (той самий секрет, який перевіряють internal endpoints)
- (опційно) `RULEBOOK_CRON_TENANT_IDS` (CSV-список tenant id для щоденного cron, напр. `id1,id2`)

## 1. Ініціалізація rulebook

### Через npm script (рекомендовано)

```bash
npm run rulebook:init
```

Опції:

- один tenant:

```bash
npm run rulebook:init -- --tenant <TENANT_UUID>
```

- повна заміна правил у версії:

```bash
npm run rulebook:init -- --tenant <TENANT_UUID> --replace-rules
```

- кастом версія:

```bash
npm run rulebook:init -- \
  --tenant <TENANT_UUID> \
  --version-code ua_2026_v1 \
  --version-name "UA Rulebook 2026" \
  --effective-from 2026-01-01
```

### Прямий HTTP виклик

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/internal/rulebook/init" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"tenantId":"<TENANT_UUID>","activateVersion":true,"replaceRules":false}'
```

## 2. Dry-run генерації

```bash
npm run rulebook:generate:dry -- --tenant <TENANT_UUID>
```

За потреби вікно дат:

```bash
npm run rulebook:generate:dry -- \
  --tenant <TENANT_UUID> \
  --from 2026-02-01 \
  --to 2026-03-31
```

У відповіді дивитись поля:

- `matchedCandidates`
- `createdTasks` (в dry-run має бути 0)
- `errors`

## 3. Реальна генерація

```bash
npm run rulebook:generate -- --tenant <TENANT_UUID>
```

Для всіх активних tenant (без `--tenant`):

```bash
npm run rulebook:generate
```

## 4. Щоденний cron

У `vercel.json` додано:

- `0 4 * * *` -> `/api/internal/cron/rulebook-generate`

Після деплою Vercel почне викликати endpoint автоматично (UTC timezone).

Рекомендований режим для безпечного масштабування:

- встановити `RULEBOOK_CRON_TENANT_IDS` і обмежити cron конкретними tenant;
- без цього env cron буде обробляти всіх активних tenant.

## 5. Підключення сторінки правил до real DB

Сторінка вже читає/пише в `rulebook_versions` + `rulebook_rules`:

- `src/app/(dashboard)/settings/tax-rules/page.tsx`
- `src/lib/hooks/use-rulebook.ts`
- `src/lib/actions/rulebook.ts`

Що перевірити вручну в UI:

1. Відкрити `/settings/tax-rules`.
2. Натиснути `Init (merge)` якщо активної версії немає.
3. Створити або змінити правило.
4. Виконати toggle active/inactive.
5. За потреби видалити назавжди тільки в формі редагування (Danger zone).
6. Переконатись, що оновлення видно після refresh.

## 6. Типові проблеми

### `relation ... already exists` при SQL запуску

Це означає, що DDL вже застосований раніше. Не запускайте один і той самий `CREATE TABLE` вручну повторно. Для продовження використовуйте нову migration-файл версію.

### `Unauthorized` на internal endpoints

Перевірити:

- правильний `x-cron-secret`
- наявність `CRON_SECRET` у runtime
- endpoint URL без помилки

### Redirect на `/login` для internal route

`/api/internal/rulebook/*` виключено з middleware matcher і має працювати без auth-cookie.
