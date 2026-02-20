# PrivatBank API інтеграція (виписка)

Документ описує MVP-інтеграцію PrivatBank в цьому проєкті для отримання банківської виписки через API.

## 1. Що використовується з офіційного API

Базовий URL (за замовчуванням):

```text
https://acp.privatbank.ua
```

Ключові endpoint-и для задачі (зовнішній PrivatBank API):

- `POST /api/statements/transactions?acc=<...>&startDate=<dd-mm-yyyy>&endDate=<dd-mm-yyyy>` - транзакції (виписка)
- `POST /api/statements/balance?startDate=<dd-mm-yyyy>&endDate=<dd-mm-yyyy>` - баланс/агреговані дані по рахунках за період

Джерела:

- [PrivatBank ACP portal](https://acp.privatbank.ua/main)
- [OpenAPI: /api/statements/transactions](https://acp.privatbank.ua/business/openapi/openapi-client/getapistatementstransactions)
- [OpenAPI: /api/statements/balance](https://acp.privatbank.ua/business/openapi/openapi-client/getapistatementsbalance)

## 2. Аутентифікація

Для викликів використовуються **два** заголовки:

```http
id: <YOUR_PRIVATBANK_CLIENT_ID>
token: <YOUR_PRIVATBANK_TOKEN>
accept: application/json
```

Токен зберігається в БД у зашифрованому вигляді (`privatbank_accountant_tokens`), `client_id` — у відкритому вигляді.

## 3. Формат дат

PrivatBank endpoint для виписок використовує формат дат `DD-MM-YYYY`.

У нашому API можна передавати:

- `DD-MM-YYYY` (передається як є)
- `YYYY-MM-DD` (автоматично конвертується в `DD-MM-YYYY`)

## 4. Нові API-роути у проєкті

Усі роутинги нижче доступні тільки для авторизованих користувачів з роллю `admin` або `accountant`.

- `GET /api/integrations/privatbank/me` - статус токена поточного користувача
- `PUT /api/integrations/privatbank/me/token` - зберегти/оновити токен
- `DELETE /api/integrations/privatbank/me/token` - деактивувати токен
- `GET /api/integrations/privatbank/balance` - отримати баланс/дані по рахунках за період
- `GET /api/integrations/privatbank/statements` - отримати виписку

### Параметри `/api/integrations/privatbank/statements`

- `acc` (або `account`) - рахунок (обов'язково)
- `startDate` - початок періоду (обов'язково)
- `endDate` - кінець періоду (обов'язково)
- `fetchAll` - `true/false`, за замовчуванням `true`
- `followId` - курсор наступної сторінки (для `fetchAll=false`)
- `limit` - кількість рядків на сторінку
- `maxPages` - ліміт сторінок при `fetchAll=true`

## 5. Приклади

### 5.1 Зберегти токен

```bash
curl -X PUT http://localhost:3000/api/integrations/privatbank/me/token \
  -H 'content-type: application/json' \
  -d '{"clientId":"YOUR_PRIVATBANK_CLIENT_ID","token":"YOUR_PRIVATBANK_TOKEN"}'
```

### 5.2 Отримати баланс/дані по рахунках за період

```bash
curl 'http://localhost:3000/api/integrations/privatbank/balance?startDate=2026-02-01&endDate=2026-02-19'
```

### 5.3 Отримати повну виписку за період

```bash
curl 'http://localhost:3000/api/integrations/privatbank/statements?acc=UA123456789012345678901234567&startDate=2026-02-01&endDate=2026-02-19&fetchAll=true&limit=200&maxPages=20'
```

### 5.4 Отримати тільки одну сторінку

```bash
curl 'http://localhost:3000/api/integrations/privatbank/statements?acc=UA123456789012345678901234567&startDate=01-02-2026&endDate=19-02-2026&fetchAll=false&limit=200'
```

## 6. Конфігурація середовища

Додати в `.env.local`:

```env
PRIVATBANK_TOKEN_ENCRYPTION_KEY=<32-byte-secret-or-base64>
# Optional:
# PRIVATBANK_API_BASE_URL=https://acp.privatbank.ua
```
