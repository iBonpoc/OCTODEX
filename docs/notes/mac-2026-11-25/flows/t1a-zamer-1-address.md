# Задание 1(а): «Замер gutter», клиент с одним адресом (main d83e07f8)
1. Клиенты → David Kim (CLT-0002, адрес 4512 Ventura Canyon Ave).
2. Старт записи: xcrun simctl io booted recordVideo --codec h264 --force ~/GoRix/shots/t1/t1a.mp4
3. Нажать «Замер gutter» (x=93, y=506 пт).
4. Ждать 2–4 с, снимок.
5. Нажать «назад» (x=30, y=88 пт), снимок.
6. Стоп записи: pkill -INT -f "recordVideo.*t1a".
7. Кадры: ~/GoRix/tools/scripts/frames t1a.mp4 a 10 140; переходы: sheet --diff a/*.jpg
