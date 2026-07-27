---
change_id: referral-licenses
title: Referral license sales (3 links per user, 500 zł/license)
status: planned
created: 2026-07-27
updated: 2026-07-27
---

## Notes

Original intent (user, 2026-07-27, PL): obsługa sprzedaży licencji przez polecenia —
każdy kursant dostaje 3 linki referencyjne dla współpracowników z firmy lub znajomych.
Polecający dostaje mały zwrot (kickback), polecony promocję. Cena 500 zł za licencję.
Cel: zachęcić do zakupu kursu. Po wejściu z linku: automatyczna zniżka na kurs i krótki
lejek zakupowy; jeśli lead nie kupuje od razu — zaproszenie do lead magnetów i do
10xDevs 4.0 hub przez specjalny gate dla leada.

Decision pending (morning review): scope split between 10x-cli (referral command
surface), the delivery API in 10x-toolkit (link issuance, redemption, kickback ledger,
discount codes), and edu-platform (lead gate to the 4.0 hub, lead magnets, funnel).
This plan covers the CLI-owned slice end-to-end and pins the cross-repo contracts as
explicit dependencies.
