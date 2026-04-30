import csv
import re
from bs4 import BeautifulSoup


def parse_html_to_csv(html_file, csv_file):
    # Abrindo o arquivo HTML
    with open(html_file, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    rows = soup.find_all("tr")
    moves_data = []

    headers = ["Level", "Name", "Type", "Category", "Power", "Accuracy", "PP"]
    moves_data.append(headers)

    for row in rows[2:]:
        cols = row.find_all("td")

        if len(cols) < 4:
            continue

        level = cols[0].get_text(strip=True)
        name = cols[1].get_text(strip=True)

        images = cols[2].find_all("img")
        if len(images) >= 2:
            type_src = images[0].get("src", "")
            cat_src = images[1].get("src", "")

            type_match = re.search(r"en_([a-z]+)\.png", type_src)
            move_type = type_match.group(1).capitalize() if type_match else "Unknown"

            cat_match = re.search(r"move_([a-z]+)\.png", cat_src)
            category = cat_match.group(1).capitalize() if cat_match else "Unknown"
        else:
            move_type, category = "Unknown", "Unknown"

        stats_text = cols[3].get_text(separator=" ", strip=True)

        power_match = re.search(r"Power:\s*([0-9—]+)", stats_text)
        acc_match = re.search(r"Acc:\s*([0-9—]+)", stats_text)
        pp_match = re.search(r"PP:\s*([0-9—]+)", stats_text)

        power = power_match.group(1) if power_match else "0"
        acc = acc_match.group(1) if acc_match else "0"
        pp = pp_match.group(1) if pp_match else "0"

        moves_data.append([level, name, move_type, category, power, acc, pp])

    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(moves_data)

    print(f"Sucesso! {len(moves_data) - 1} golpes parseados e salvos em {csv_file}")
