"""Genera img/productos/400/ e img/productos/800/ a partir de las fotos de 900x900.
Uso (desde la carpeta pasteleria-mishky):  pip install pillow  &&  python herramientas/generar_miniaturas.py
"""
from pathlib import Path
from PIL import Image

origen = Path("img/productos")
for ancho in (400, 800):
    destino = origen / str(ancho)
    destino.mkdir(exist_ok=True)
    for foto in origen.glob("*.jpg"):
        with Image.open(foto) as im:
            im.resize((ancho, ancho), Image.LANCZOS).save(destino / foto.name, quality=82, optimize=True)
        print("OK", destino / foto.name)
