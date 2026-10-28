import os
import urllib.request
import json
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE_DIR = os.path.join(BASE_DIR, "sample_music")

TRACKS = [
    # 1. King Gizzard & The Lizard Wizard - Polygondwanaland (2017) [Psychedelic Rock / Prog] (Public Domain)
    {
        "url": "https://archive.org/download/king-gizzard-and-the-lizard-wizard-polygondwanaland/King%20Gizzard%20%26%20The%20Lizard%20Wizard%20-%20Polygondwanaland%20-%2002%20Polygondwanaland.mp3",
        "folder": "King Gizzard & The Lizard Wizard/Polygondwanaland (2017)",
        "filename": "02 - Polygondwanaland.mp3"
    },
    {
        "url": "https://archive.org/download/king-gizzard-and-the-lizard-wizard-polygondwanaland/King%20Gizzard%20%26%20The%20Lizard%20Wizard%20-%20Polygondwanaland%20-%2003%20The%20Castle%20In%20The%20Air.mp3",
        "folder": "King Gizzard & The Lizard Wizard/Polygondwanaland (2017)",
        "filename": "03 - The Castle In The Air.mp3"
    },
    {
        "url": "https://archive.org/download/king-gizzard-and-the-lizard-wizard-polygondwanaland/King%20Gizzard%20%26%20The%20Lizard%20Wizard%20-%20Polygondwanaland%20-%2005%20Inner%20Cell.mp3",
        "folder": "King Gizzard & The Lizard Wizard/Polygondwanaland (2017)",
        "filename": "05 - Inner Cell.mp3"
    },
    # 2. Nine Inch Nails - Ghosts I-IV (2008) [Ambient / Electronic] (CC BY-NC-SA 3.0)
    {
        "url": "https://archive.org/download/nineinchnails_ghosts_I_IV/01_Ghosts_I.mp3",
        "folder": "Nine Inch Nails/Ghosts I-IV (2008)",
        "filename": "01 - 1 Ghosts I.mp3"
    },
    {
        "url": "https://archive.org/download/nineinchnails_ghosts_I_IV/02_Ghosts_I.mp3",
        "folder": "Nine Inch Nails/Ghosts I-IV (2008)",
        "filename": "02 - 2 Ghosts I.mp3"
    },
    # 3. Sasha Yeller - Heroin EP (2012) [Deep-X Recordings - Electronic / Techno] (CC BY-NC-ND 3.0)
    {
        "url": "https://archive.org/download/deepx207/deepx207-02_-_Sasha_Yeller_-_Space_Invader.mp3",
        "folder": "Sasha Yeller/Heroin EP (2012)",
        "filename": "02 - Space Invader.mp3"
    },
    # 4. Alic - Close Distance (2014) [Digital Diamonds - Psychedelic Techno] (CC BY-NC-ND)
    {
        "url": "https://archive.org/download/DigitalDiamonds032L/01_alic_-_close_distance.mp3",
        "folder": "Alic/Close Distance (2014)",
        "filename": "01 - Close Distance.mp3"
    },
    {
        "url": "https://archive.org/download/DigitalDiamonds032L/04_alic_-_the_pursuit_of_happyness.mp3",
        "folder": "Alic/Close Distance (2014)",
        "filename": "04 - The Pursuit of Happyness.mp3"
    }
]

def download():
    os.makedirs(SAMPLE_DIR, exist_ok=True)
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

    for track in TRACKS:
        target_dir = os.path.join(SAMPLE_DIR, track["folder"])
        os.makedirs(target_dir, exist_ok=True)
        target_file = os.path.join(target_dir, track["filename"])

        if os.path.exists(target_file) and os.path.getsize(target_file) > 100000:
            print(f"[Exists] {track['filename']}")
            continue

        print(f"Downloading {track['filename']}...")
        req = urllib.request.Request(track["url"], headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp, open(target_file, "wb") as f:
                while chunk := resp.read(65536):
                    f.write(chunk)
            size_mb = os.path.getsize(target_file) / (1024 * 1024)
            print(f"  -> Saved ({size_mb:.1f} MB)")
        except Exception as e:
            print(f"  -> Failed {track['filename']}: {e}")

if __name__ == "__main__":
    download()
