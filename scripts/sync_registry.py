#!/usr/bin/env python3
import os, io, csv, zipfile, requests
from datetime import datetime
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REGISTRY_ZIP_URL = "https://fsrar.gov.ru/opendata/7710747640-reestrlic/data-20260408t0000-structure-20190918t0000.zip"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

def classify_license(activity_type):
    t = activity_type.lower()
    is_spirit = "спиртосодержащ" in t
    is_spirit_food = is_spirit and "пищев" in t
    is_spirit_nonfood = is_spirit and "непищев" in t
    is_ethanol = "этилового спирта" in t
    is_alco = not is_spirit and not is_ethanol
    is_retail = "розничн" in t
    is_restaurant = "общепит" in t or "общественного питания" in t
    is_production = "производств" in t
    if is_ethanol:
        return {"label": "ЭТИЛ СПИРТ", "color": "orange"}
    if is_spirit_nonfood:
        return {"label": "ПРОИЗВ СПИРТ-НЕПИЩ" if is_production else "ЗХП СПИРТ-НЕПИЩ", "color": "gray"}
    if is_spirit_food:
        return {"label": "ПРОИЗВ СПИРТ-ПИЩ" if is_production else "ЗХП СПИРТ-ПИЩ", "color": "purple"}
    if is_alco and is_retail and is_restaurant:
        return {"label": "РОЗНИЦА ОБЩЕПИТ", "color": "blue"}
    if is_alco and is_retail:
        return {"label": "РОЗНИЦА АЛКО", "color": "blue"}
    if is_alco and is_production:
        return {"label": "ПРОИЗВ АЛКО", "color": "blue"}
    if is_alco:
        return {"label": "ЗХП АЛКО", "color": "blue"}
    return {"label": "ИНОЕ", "color": "gray"}

def parse_date(s):
    if not s:
        return None
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None

def find_col(headers, *variants):
    for i, h in enumerate(headers):
        for v in variants:
            if v.lower() in h.lower():
                return i
    return -1

def sync():
    print(f"Скачиваем: {REGISTRY_ZIP_URL}")
    resp = requests.get(REGISTRY_ZIP_URL, headers=HEADERS, timeout=300)
    resp.raise_for_status()
    print(f"Скачано: {len(resp.content):,} байт")
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        csv_files = [f for f in zf.namelist() if f.endswith(".csv")]
        if not csv_files:
            raise Exception("CSV не найден в ZIP")
        raw = zf.read(csv_files[0])
        print(f"CSV: {csv_files[0]}")
    csv_text = None
    for enc in ("utf-8-sig", "windows-1251", "utf-8"):
        try:
            csv_text = raw.decode(enc)
            print(f"Кодировка: {enc}")
            break
        except UnicodeDecodeError:
            continue
    if not csv_text:
        raise Exception("Не удалось декодировать CSV")
    delimiter = ";" if csv_text.count(";") > csv_text.count(",") else ","
    reader = csv.reader(io.StringIO(csv_text), delimiter=delimiter)
    headers = next(reader)
    print(f"Колонок: {len(headers)}, первые: {headers[:6]}")
    col = {
        "inn":      find_col(headers, "инн", "inn"),
        "kpp":      find_col(headers, "кпп", "kpp"),
        "name":     find_col(headers, "наименование", "организация"),
        "number":   find_col(headers, "номер лицензии", "рег. номер", "номер"),
        "status":   find_col(headers, "статус", "состояние"),
        "date_from":find_col(headers, "дата выдачи", "дата начала"),
        "date_to":  find_col(headers, "дата окончания", "срок"),
        "activity": find_col(headers, "вид деятельности", "деятельность"),
        "address":  find_col(headers, "адрес", "место нахождения"),
    }
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    records = []
    for row in reader:
        if len(row) < 3:
            continue
        def get(key, row=row):
            idx = col.get(key, -1)
            if idx < 0 or idx >= len(row):
                return ""
            return row[idx].strip()
        inn = get("inn")
        if not inn or len(inn) < 10:
            continue
        cl = classify_license(get("activity"))
        records.append({
            "inn":           inn,
            "kpp":           get("kpp") or None,
            "company_name":  get("name") or None,
            "license_number":get("number") or None,
            "status":        get("status") or None,
            "valid_from":    parse_date(get("date_from")),
            "valid_to":      parse_date(get("date_to")),
            "activity_type": get("activity") or None,
            "license_label": cl["label"],
            "license_color": cl["color"],
            "addresses":     [get("address")] if get("address") else None,
            "downloaded_at": datetime.utcnow().isoformat(),
        })
    print(f"Записей: {len(records):,}")
    batch_size = 500
    uploaded = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        supabase.table("registry_cache").upsert(
            batch, on_conflict="inn,license_number"
        ).execute()
        uploaded += len(batch)
        print(f"Загружено: {uploaded:,}/{len(records):,}")
    supabase.table("registry_meta").upsert({
        "id": 1,
        "last_downloaded_at": datetime.utcnow().isoformat(),
        "csv_url": REGISTRY_ZIP_URL,
        "total_records": len(records),
    }).execute()
    print("Готово!")

if __name__ == "__main__":
    sync()
