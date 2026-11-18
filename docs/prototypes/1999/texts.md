# #1999 — тексты письма с кодом входа (RU / EN / ES)

Язык письма — язык человека (правило 7): `{{ .Data.lang }}` из `user_metadata`. Приложение кладёт туда язык интерфейса при первом входе: `signInWithOtp({ options: { data: { lang } } })`. У существующих — то, что уже записано. Нет языка — `en` (рынок США). В шаблоне Supabase — `{{ if eq .Data.lang "es" }}…{{ else if eq .Data.lang "ru" }}…{{ else }}…{{ end }}` ([Supabase: Customizing emails by language](https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q)).

`{{ .Token }}` — код, `{{ .Email }}` — адрес. Код стоит в теме письма первым: его видно в уведомлении и в списке писем, а Gmail показывает у такого письма «Copy code». Строка превью код не повторяет — в ней срок и «не сообщайте».

Испанский — на «usted» (DS §4.2).

## EN (по умолчанию)
- **Тема:** `{{ .Token }} is your GoRix sign-in code`
- **Превью:** Expires in 10 minutes. Don’t share it.
- **Заголовок:** Your GoRix sign-in code
- **Текст:** Enter this code in the GoRix app. It expires in 10 minutes.
- **Безопасность:** Didn’t ask for a code? You can ignore this email — no one can sign in without it. Don’t share this code. No one from GoRix will ever ask for it.
- **Подвал:** GoRix · Sent to `{{ .Email }}` because a sign-in was requested. Questions? Reply to this email. ← вторая фраза — только если есть ящик для ответов

## ES
- **Тема:** `{{ .Token }} es su código para iniciar sesión en GoRix`
- **Превью:** Vence en 10 minutos. No lo comparta.
- **Заголовок:** Su código para iniciar sesión en GoRix
- **Текст:** Ingrese este código en la app de GoRix. Vence en 10 minutos.
- **Безопасность:** ¿No pidió un código? No tiene que hacer nada: nadie puede entrar sin él. No comparta este código. Nadie de GoRix se lo pedirá.
- **Подвал:** GoRix · Enviado a `{{ .Email }}` porque se solicitó iniciar sesión. ¿Preguntas? Responda a este correo.

## RU
- **Тема:** `{{ .Token }} — код для входа в GoRix`
- **Превью:** Действует 10 минут. Никому не сообщайте.
- **Заголовок:** Код для входа в GoRix
- **Текст:** Введите этот код в приложении GoRix. Он действует 10 минут.
- **Безопасность:** Не запрашивали код? Ничего делать не нужно — без кода войти нельзя. Никому не сообщайте код: сотрудники GoRix его никогда не спрашивают.
- **Подвал:** GoRix · Отправлено на `{{ .Email }}`, потому что запрошен вход. Вопросы? Ответьте на это письмо.

## Текстовая версия (EN; так же для ES и RU)
```
Your GoRix sign-in code

{{ .Token }}

Enter this code in the GoRix app. It expires in 10 minutes.

Didn’t ask for a code? You can ignore this email — no one can sign in without it.
Don’t share this code. No one from GoRix will ever ask for it.

GoRix · Sent to {{ .Email }} because a sign-in was requested.
```
Встроенная отправка Supabase шлёт только HTML. Текстовая часть появится, когда письма пойдут через Send Email Hook → Resend: там `text` задаётся отдельно.

## Чего в письме нет
- «Click here», «Verify», кнопок и ссылок: в письме входа ссылок нет. Мошенники копируют письма входа со ссылкой, а код вводится только в приложении.
- «Do not reply» и адреса noreply: ответить можно (подвал), если основатель даст ящик поддержки (вопрос в README).
- Рекламы, соцсетей, «Download the app»: письмо транзакционное. По CAN-SPAM реклама делает письмо коммерческим и требует отписки, а Gmail уводит такие письма в «Промоакции».
