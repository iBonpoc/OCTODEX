# #1999 — тексты письма с кодом входа (RU / EN / ES)

Язык письма — язык человека (правило 7): `{{ .Data.lang }}` из `user_metadata` (приложение кладёт язык интерфейса при первом входе через `signInWithOtp({ options: { data: { lang } } })`; у существующих — то, что записано). Нет — `en` (рынок США). В шаблоне Supabase — `{{ if eq .Data.lang "es" }}…{{ else if eq .Data.lang "ru" }}…{{ else }}…{{ end }}` ([Supabase: Customizing emails by language](https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q)).

`{{ .Token }}` — код, `{{ .Email }}` — адрес. Код в теме письма первым: виден в уведомлении и в списке писем, Gmail показывает у такого письма «Copy code».

## EN (по умолчанию)
- **Тема:** `{{ .Token }} is your GoRix sign-in code`
- **Превью (скрытая строка):** `{{ .Token }} — your GoRix sign-in code. It expires in 10 minutes.`
- **Заголовок:** Your GoRix sign-in code
- **Текст:** Enter this code in the GoRix app. It expires in 10 minutes.
- **Код:** `{{ .Token }}`
- **Безопасность:** Didn’t ask for a code? Ignore this email — no one can sign in without it. Never share this code. GoRix will never ask you for it.
- **Подвал:** GoRix · Sent to `{{ .Email }}` because a sign-in was requested. Questions? Reply to this email.

## ES
- **Тема:** `{{ .Token }} es tu código para entrar en GoRix`
- **Превью:** `{{ .Token }} — tu código de GoRix. Vence en 10 minutos.`
- **Заголовок:** Tu código para entrar en GoRix
- **Текст:** Escribe este código en la app GoRix. Vence en 10 minutos.
- **Безопасность:** ¿No pediste un código? Ignora este correo: nadie puede entrar sin él. No compartas este código. GoRix nunca te lo pedirá.
- **Подвал:** GoRix · Enviado a `{{ .Email }}` porque se pidió entrar. ¿Preguntas? Responde a este correo.

## RU
- **Тема:** `{{ .Token }} — код для входа в GoRix`
- **Превью:** `{{ .Token }} — код для входа в GoRix. Действует 10 минут.`
- **Заголовок:** Код для входа в GoRix
- **Текст:** Введите этот код в приложении GoRix. Он действует 10 минут.
- **Безопасность:** Не запрашивали код? Просто не обращайте внимания на письмо — без кода войти нельзя. Никому не сообщайте код: GoRix никогда его не спрашивает.
- **Подвал:** GoRix · Отправлено на `{{ .Email }}`, потому что кто-то запросил вход. Вопросы? Ответьте на это письмо.

## Текстовая версия (EN; так же для ES и RU)
```
Your GoRix sign-in code

{{ .Token }}

Enter this code in the GoRix app. It expires in 10 minutes.

Didn’t ask for a code? Ignore this email — no one can sign in without it.
Never share this code. GoRix will never ask you for it.

GoRix · Sent to {{ .Email }} because a sign-in was requested.
```
Supabase через свой SMTP шлёт только HTML; текстовая часть появится, когда письма пойдут через Send Email Hook → Resend (там `text` задаётся отдельно). До этого — только HTML.

## Слова, которые не пишем
- «Click here», «Verify», кнопки и ссылки — в письме входа ссылок нет (фишинг копирует письма со ссылкой; код ввести можно только в приложении).
- «Do not reply» / адрес noreply — отвечать можно (подвал), если основатель даст ящик поддержки (вопрос в README).
- Реклама, соцсети, «Download the app» — нет: письмо транзакционное (CAN-SPAM: реклама делает его коммерческим, нужна отписка; Gmail уводит такие во «Промоакции»).
