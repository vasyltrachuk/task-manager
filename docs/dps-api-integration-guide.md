# ДПС Публічний API — Інструкція з інтеграції

> Документ призначений для LLM-агентів та розробників, які працюють з кодом
> у `/src/lib/server/integrations/dps/`. Дотримуйтесь цього документу при
> будь-яких змінах, рефакторингу або налагодженні DPS-інтеграції.

---

## 1. Загальна характеристика API

| Параметр | Значення |
|---|---|
| Base URL | `https://cabinet.tax.gov.ua/ws/api/public/registers/` |
| Метод | **POST** з `Content-Type: application/json` (крім фіскальних чеків) |
| Аутентифікація | Поле `token` у тілі кожного запиту |
| Ліміт | 1000 запитів/добу на токен. Перевищення — токен **автоматично анулюється без попередження** |
| Тайм-аут | Рекомендований: 15 секунд |

---

## 2. Реєстри та їх ендпоінти

### 2.1 `registration` — Облік платника податків

```
POST /ws/api/public/registers/registration
```

**Тіло запиту:**
```json
{
  "tins": "<ЄДРПОУ>",
  "name": null,
  "token": "<token>"
}
```

**Поля відповіді (UPPERCASE):**
```
FULL_NAME        — повна назва / ПІБ
TIN_S            — ЄДРПОУ / РНОКПП
ADRESS           — податкова адреса (не "address"!)
D_REG_STI        — дата взяття на облік
N_REG_STI        — номер запису обліку
C_STI_MAIN_NAME  — назва основного органу ДПС
C_STI_MAIN       — код основного органу ДПС
VED_LIC          — КВЕД / ліцензія
FACE_MODE        — форма власності (ФО, ЮО, ФОП тощо)
C_STAN           — стан обліку
D_ZAKR_STI       — дата зняття з обліку
C_KIND           — вид суб'єкта
C_CLOSE          — ознака закриття
```

> **УВАГА:** Поле адреси — `ADRESS` (з одним `d`), а не `address`.
> Нормалізатор має шукати `['adress', 'address', ...]` — `adress` першим.

**Для кого:** юридичні особи (ЄДРПОУ) та ФОП (РНОКПП).
**Пріоритет:** найвищий серед усіх реєстрів для `subjectName`, `address`, `activityCode/Name`.

---

### 2.2 `ev` — Реєстр платників єдиного податку

```
POST /ws/api/public/registers/ev
```

**Тіло запиту:**
```json
{
  "tin": "<ЄДРПОУ або РНОКПП>",
  "name": null,
  "token": "<token>"
}
```

> **Параметр — `tin` (singular)**, не `tins`.

**Поля відповіді (реальна відповідь від ДПС):**
```
TIN_S            — ЄДРПОУ / РНОКПП
FULL_NAME        — назва / ПІБ
DATE_ACC_ERS     — дата включення до реєстру ЄП
ID_ERS           — ідентифікатор у реєстрі ЄП
C_STI_MAIN_NAME  — назва органу ДПС
KVED             — КВЕД
RCLASS           — група єдиного податку (1, 2, 3, 4)
DATE_DCC_ERS     — дата виключення з реєстру ЄП
IS_PAYER         — чинний платник ЄП (0/1)
```

**КРИТИЧНО — `RCLASS` і `IS_PAYER`:**
- `RCLASS` = `"1"`, `"2"`, `"3"`, `"4"` — **номер групи ЄП**
- `IS_PAYER` = `"1"` — активний платник ЄП; `"0"` — не активний

**Маппінг групи ЄП → `TaxSystem`:**
| RCLASS | IS_PAYER | is_vat_payer | tax_system |
|---|---|---|---|
| `"1"` | `"1"` | — | `single_tax_group1` |
| `"2"` | `"1"` | — | `single_tax_group2` |
| `"3"` | `"1"` | `true` | `single_tax_group3_vat` |
| `"3"` | `"1"` | `false`/`undefined` | `single_tax_group3` |
| `"4"` | `"1"` | — | `single_tax_group4` |
| будь-який | `"0"` | — | визначається з інших реєстрів |

**Для кого:** ФОП та юридичні особи — платники єдиного податку.

---

### 2.3 `pdv_act` — Реєстр платників ПДВ

```
POST /ws/api/public/registers/pdv_act/list
```

**Тіло запиту:**
```json
{
  "kodPdvList": null,
  "tinList": "<ЄДРПОУ>",
  "name": null,
  "token": "<token>"
}
```

> **Параметр — `tinList`** (не `tin`, не `tins`). Максимум 10 кодів через пробіл.

**Поля відповіді:**
```
kodPdv     — індивідуальний податковий номер платника ПДВ
tin        — ЄДРПОУ
name       — назва
datReestr  — дата реєстрації платником ПДВ
datAnul    — дата анулювання
kodPdvs    — тип платника ПДВ
datTerm    — термін дії
dreestrSg  — ознака діючий/скасований
datSvd     — дата свідоцтва
danulSg    — ознака анулювання
dpdvSg     — ознака ПДВ
kodAnul    — код причини анулювання
kodPid     — код підрозділу
```

**Визначення статусу ПДВ:**
- Якщо `datAnul` заповнено — платник **анульований** (`isVatPayer = false`)
- Якщо `datAnul` порожній і запис знайдений — **активний платник ПДВ** (`isVatPayer = true`)
- Якщо запис не знайдений — **не платник ПДВ** (`isVatPayer = false`)

**Для кого:** перевірка статусу ПДВ для будь-якого суб'єкта.

---

### 2.4 `non-profit` — Реєстр неприбуткових організацій

```
POST /ws/api/public/registers/non-profit
```

**Тіло запиту:**
```json
{
  "tin": "<ЄДРПОУ>",
  "name": null,
  "token": "<token>"
}
```

> **Параметр — `tin` (singular)**.

**Поля відповіді:**
```
TIN_S      — ЄДРПОУ
FULL_NAME  — назва організації
...        — дати включення/виключення, ознака неприбутковості
```

**Для кого:** ГО, фонди, ОСББ, релігійні організації тощо.

---

## 3. Поля suggestion та їх відображення у формі

| Поле suggestion | Тип | Де відображається |
|---|---|---|
| `name` | string | Поле "Назва / ПІБ" |
| `type` | ClientType | Кнопки "Тип клієнта" |
| `tax_system` | TaxSystem | Селект "Система оподаткування" |
| `is_vat_payer` | boolean | Визначається з `tax_system` автоматично |
| `industry` | string | Поле "Галузь" |
| `notes` | string | Textarea "Нотатки" (merge, не заміна) |
| `dps_office_name` | string | Картка ДПС: "Найменування ДПІ" |
| `dps_office_code` | string | Картка ДПС: поряд з назвою ДПІ |
| `tax_registration_date` | string | Картка ДПС: "Дата взяття на облік" |
| `simplified_system_date` | string | Картка ДПС: "Дата переходу на спрощену" |
| `single_tax_group` | 1\|2\|3\|4 | Картка ДПС: "Група єдиного податку" |
| `tax_address` | string | Картка ДПС: "Податкова адреса" |
| `ved_lic` | string | Картка ДПС: "КВЕД / Ліцензована діяльність" |

> **Картка ДПС** — окремий блок у формі, з'являється після натискання "Підтягнути з ДПС".
> Відображає read-only дані для довідки. Ці ж дані включені в `notes` автоматично.

## 4. Пріоритети при заповненні форми клієнта

### 3.1 `subjectName` (назва / ПІБ)
```
1. registration.FULL_NAME
2. ev.FULL_NAME
3. pdv_act.name
4. non-profit.FULL_NAME
```

### 3.2 `address` (податкова адреса)
```
1. registration.ADRESS  ← головний, завжди шукати першим
2. ev.address/ADRESS
3. pdv_act.address
```

### 3.3 `activityCode` / `activityName` (КВЕД)
```
1. registration.VED_LIC / KVED / kved_code
2. ev.KVED / kved_code / kved_name
3. pdv_act.kved
4. non-profit.kved
```

### 3.4 `taxSystem` (система оподаткування)
```
Якщо non-profit.isFound     → 'non_profit'
Якщо ev.isFound:
  ev.RCLASS === '1'          → 'single_tax_group1'
  ev.RCLASS === '2'          → 'single_tax_group2'
  ev.RCLASS === '3' + ПДВ   → 'single_tax_group3_vat'
  ev.RCLASS === '3' - ПДВ   → 'single_tax_group3'
  ev.RCLASS === '4'          → 'single_tax_group4'
  ev.taxSystem contains 'загаль' → general_vat або general_no_vat
Якщо pdv_act.isVatPayer=true → 'general_vat'
Якщо pdv_act.isVatPayer=false і є ev або pdv_act запис → 'general_no_vat'
Інакше                       → undefined
```

### 3.5 `isVatPayer` (платник ПДВ)
```
1. pdv_act.isFound && !datAnul  → true
2. pdv_act.isFound && datAnul   → false
3. ev.IS_PAYER + ev.is_vat_payer (якщо pdv_act не знайдений)
```

### 3.6 `clientType`
```
non-profit.isFound              → 'NGO'
name contains 'ОСББ'            → 'OSBB'
name contains ГО/БЛАГОД/ФОНД    → 'NGO'
taxIdType === 'rnokpp'          → 'FOP'
name contains ТОВ/ПП/АТ/КП або taxIdType === 'edrpou' → 'LLC'
```

---

## 4. Відомі проблеми та їх вирішення

### Проблема 1: `ADRESS` vs `address`
API реєстру `registration` повертає поле `ADRESS` (один `d`).
Нормалізатор у `normalizeRegistrationPayload` шукає `['adress', 'address', ...]` —
але тільки через `pickFieldFromPayload`, який перетворює ключі в lowercase.
**Перевірити:** що `adress` стоїть **першим** у масиві ключів.

### Проблема 2: `RCLASS` — числова рядкова група ЄП
Реальна відповідь `ev` реєстру містить `RCLASS` (рядок `"1"`..`"4"`), а НЕ
поле `group` чи `tax_group`. Поточний нормалізатор шукає:
```ts
['group', 'tax_system', 'system', 'tax_group', 'group_name', 'taxation_system']
```
**`RCLASS` відсутній у цьому списку** — це означає, що група ЄП НЕ витягується
з реальної відповіді API. Потрібно додати `'rclass'` до списку полів.

### Проблема 3: `IS_PAYER` — активність платника ЄП
Реальна відповідь `ev` містить `IS_PAYER` (`"0"` або `"1"`).
Нормалізатор перевіряє `is_pdv`, `vat`, `pdv_payer` — але **не `is_payer`**.
Поле `IS_PAYER` визначає чи є суб'єкт **чинним** платником ЄП, а не платником ПДВ.
Їх не можна плутати.

### Проблема 4: Назви полів `ev` реєстру
Реальна відповідь `ev` реєстру:
```json
{
  "TIN_S": "3012456789",
  "FULL_NAME": "Іваненко Іван Іванович",
  "DATE_ACC_ERS": "2020-01-15",
  "KVED": "62.01",
  "RCLASS": "3",
  "IS_PAYER": "1",
  "C_STI_MAIN_NAME": "ГУ ДПС у Київській обл.",
  "DATE_DCC_ERS": null
}
```
Нормалізатор `normalizeEvPayload` шукає `fio`, `full_name`, `name`, `pib`...
але **`FULL_NAME` (uppercase)** — також проходить через lowercase mapping, тому
спрацьовує. Проте `KVED` (без `_code` суфікса) може не збігатись з `kved_code`.

### Проблема 5: `tinList` для `pdv_act`
Параметр для пошуку за ЄДРПОУ — **`tinList`**, а не `tin` або `tins`.
Поточна реалізація правильна, але при рефакторингу легко переплутати з іншими
реєстрами.

### Проблема 6: Відповідь може бути обгорнута або масивом
Деякі реєстри повертають дані як:
```json
[{ "TIN_S": "...", ... }]         // масив
{ "rows": [{ ... }] }             // обгортка
{ "data": { ... } }               // вкладений об'єкт
```
`firstObject()` в нормалізаторі розгортає ці варіанти. Але якщо API поверне
порожній масив `[]` або `{ "rows": [] }` — `firstObject` поверне `null` і
`isFound` буде `false`. Це правильна поведінка.

---

## 5. Правила нормалізації полів

### 5.1 Пошук поля у відповіді
```
pickFieldFromPayload(raw, keys):
  1. firstObject(raw)    — розгортає масиви та обгортки
  2. pickField(obj, keys) — пряме порівняння (case-insensitive)
  3. pickFieldDeep(raw, keys) — BFS по всій структурі (глибина ≤ 6)
```

### 5.2 Визначення "знайдено" (`isFound`)
Запис вважається знайденим, якщо хоча б одне поле містить дані:
`subjectName`, `taxSystem`, `registrationDate`, `dpsOfficeName`, `address`,
`activityCode`, `activityName`, `registrationState`, `note`.

**НЕ** покладайтесь на HTTP-статус для визначення "знайдено/не знайдено":
ДПС може повернути 200 з порожнім масивом для відсутнього платника.

### 5.3 `parseBoolean` — логічні значення
Розпізнає: `"1"`, `"true"`, `"так"`, `"зареєстровано"`, `"діючий"` → `true`
Розпізнає: `"0"`, `"false"`, `"ні"`, `"анульовано"`, `"скасовано"` → `false`

---

## 6. Токен-менеджмент

### Пріоритет токена
```
1. Токен бухгалтера, призначеного до конкретного клієнта
2. Токен поточного актора (actorProfileId)
3. Будь-який активний токен бухгалтера/адміна тенанта
```

### Обмеження токена
- **1000 запитів/добу** — автоматичне анулювання без повідомлення
- Один запит до `buildClientPrefillFromDps` = 4 запити до API (4 реєстри)
- Для синку: кожен клієнт = до 3 запитів (`ev`, `pdv_act`, `non-profit`)

### Помилки токена
- HTTP 401/403 → `DPS_PREFILL_TOKEN_INVALID`
- Рядок з `token`/`unauthor`/`forbidden`/`invalid` → вважається помилкою токена

---

## 7. Архітектура запитів

### Prefill (форма клієнта)
```
buildClientPrefillFromDps()
  ↓
resolveTokenForProfiles()     — знайти токен
  ↓
Promise.all(4 registries)     — паралельно: registration, ev, pdv_act, non-profit
  ↓
buildClientPrefillSuggestion() — інференс полів
  ↓
DpsTokenRepo.touchLastUsed()  — оновити last_used
```

### Sync (фоновий)
```
syncDpsData()
  ↓
Для кожного клієнта (послідовно або батчами):
  fetchRegistryByTaxId() × 3  — ev, pdv_act, non-profit (БЕЗ registration)
  ↓
Зберегти snapshot у БД
Кеш 24 год — пропустити якщо snapshot свіжий
```

> `registration` реєстр — **тільки для prefill**, не для sync.
> Причина: містить публічну адресу, яка рідко змінюється.

---

## 8. Реальна структура помилок ДПС

ДПС завжди повертає **HTTP 400** для будь-якої помилки — токен, техроботи, воєнний стан.
Розрізнення відбувається **тільки через `error_description`**:

```json
{ "error": "Помилка", "error_description": "Ведуться технічні роботи" }
{ "error": "Помилка", "error_description": "На період дії воєнного стану обмежено доступ до публічних електронних реєстрів" }
```

**Класифікація помилок за `error_description`:**

| Ключові слова | Тип | Код помилки в системі |
|---|---|---|
| `"технічні роботи"` | Тимчасова | `DPS_PREFILL_UNAVAILABLE` |
| `"воєнного стану"` | Тимчасова/обмеження | `DPS_PREFILL_UNAVAILABLE` |
| `"обмежено доступ"` | Тимчасова | `DPS_PREFILL_UNAVAILABLE` |
| `"token"`, `"unauthor"`, `"forbidden"`, `"invalid"`, `"401"`, `"403"` | Токен | `DPS_PREFILL_TOKEN_INVALID` |
| Інше | Невідома | `DPS_PREFILL_FETCH_FAILED` |

> **УВАГА:** `pickPayloadError()` у `dps-client.ts` читає `error_description` **першим** —
> перед `error`. Якщо цей порядок змінити — всі помилки будуть показувати лише `"Помилка"`.

## 8а. Обробка помилок

| Ситуація | Поведінка |
|---|---|
| HTTP 404 | `status: 'not_found'`, нормалізація порожнього payload |
| HTTP 4xx (крім 429) | `status: 'error'`, зберегти повідомлення, спробувати наступний spec |
| HTTP 5xx або мережева помилка | Retry: 300ms, потім 900ms, потім `status: 'error'` |
| HTTP 429 (rate limit) | Retry (як 5xx) |
| Всі реєстри = error | Throw `DPS_PREFILL_FETCH_FAILED` або `DPS_PREFILL_TOKEN_INVALID` |
| Частина реєстрів = error | Повернути suggestion з наявних даних |

---

## 9. Типові помилки при інтеграції (cheat sheet)

```
❌ body: { tin: taxId }       для pdv_act    →  ✅ { tinList: taxId }
❌ body: { tins: taxId }      для ev         →  ✅ { tin: taxId }
❌ поле 'address'             з registration →  ✅ поле 'ADRESS'
❌ поле 'group'               з ev           →  ✅ поле 'RCLASS'
❌ IS_PAYER як ознака ПДВ                    →  ✅ IS_PAYER = чинний платник ЄП
❌ datAnul відсутній = не платник ПДВ        →  ✅ запис знайдений без datAnul = платник ПДВ
❌ HTTP 200 = знайдено                       →  ✅ перевіряти вміст відповіді
❌ реєстри послідовно                        →  ✅ Promise.all() — паралельно
```

---

## 10. Конфігурація середовища

```
DPS_PUBLIC_API_BASE_URL   — перевизначити base URL (для тестів/проксі)
                            Default: https://cabinet.tax.gov.ua
DPS_PREFILL_DEBUG_LOG     — '1'/'true'/'yes' увімкнути debug логи
                            Default у non-production: увімкнено
```

---

## 11. Файли інтеграції

```
src/lib/server/integrations/dps/
  contracts.ts          — типи: DpsRegistryCode, DpsNormalizedRegistryPayload, ...
  dps-client.ts         — HTTP клієнт з retry та timeout
  normalizers.ts        — перетворення raw відповіді → нормалізований payload
  normalizers.test.ts   — unit тести нормалізаторів
  prefill.use-case.ts   — основна логіка заповнення форми
  prefill.use-case.test.ts — unit тести prefill
  resolve-token.ts      — пошук токена за пріоритетом
  resolve-token.test.ts — unit тести токена
  sync.use-case.ts      — фоновий sync всіх клієнтів
  error.ts              — маппінг DPS помилок → HTTP відповіді
src/lib/dps-prefill.ts  — публічні типи DpsClientPrefillResult
```

---

## 12. Рекомендації для LLM при внесенні змін

1. **Перед зміною нормалізатора** — перевірити реальні назви полів у розділі 2.
2. **При додаванні нового реєстру** — додати до `DPS_REGISTRY_CODES`, `dps-client.ts` (buildRequestSpecs), `normalizers.ts`, `prefill.use-case.ts` (inferTaxSystem/inferClientType якщо потрібно).
3. **При зміні пріоритетів полів** — оновити розділ 3 цього документу.
4. **`RCLASS`** — головне поле для визначення групи ЄП. Завжди перевіряти що воно є у масиві keys нормалізатора.
5. **Не плутати `tin` / `tins` / `tinList`** — кожен реєстр має свій варіант.
6. **Не запускати sync для `registration`** — тільки prefill.
7. **Завжди запускати тести після змін:** `node --test src/lib/server/integrations/dps/normalizers.test.ts`
