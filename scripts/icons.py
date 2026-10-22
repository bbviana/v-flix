"""Gera os ícones do app em assets/images/ (uso: `make icons`; requer Pillow).

O ícone é um triângulo de play apontando para baixo (lê como "v"), branco sobre preto.
Tudo é desenhado em 4x e reduzido, para bordas suaves.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
SIZE = 1024
SCALE = 4
WHITE = (245, 245, 247, 255)  # colors.text do tema
BLACK = (0, 0, 0, 255)


def triangle_mask(size: int, half: float, corner: float = 0.17) -> Image.Image:
    """Triângulo equilátero para baixo, centroide no centro, cantos arredondados.

    `half` é meia largura em fração do lado da imagem; `corner`, o raio do
    arredondamento em fração da largura do triângulo.
    """
    s = size * SCALE
    w = 2 * s * half
    h = w * 0.866
    top = s / 2 - h / 3
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).polygon([(s / 2 - w / 2, top), (s / 2 + w / 2, top), (s / 2, top + h)], fill=255)
    # Desfoque + limiar arredonda os cantos convexos por igual.
    m = m.filter(ImageFilter.GaussianBlur(w * corner / 2))
    m = m.point(lambda v: 255 if v > 128 else 0)
    return m.resize((size, size), Image.LANCZOS)


def glyph(size: int, half: float, background=None) -> Image.Image:
    img = Image.new('RGBA', (size, size), background or (0, 0, 0, 0))
    img.paste(Image.new('RGBA', (size, size), WHITE), (0, 0), triangle_mask(size, half))
    return img


def main() -> None:
    # Ícone "legado" (e base para lojas): fundo preto, triângulo ~40% da largura.
    glyph(SIZE, 0.2, BLACK).save(OUT / 'icon.png')
    # Ícone adaptativo: a frente precisa caber na zona segura (círculo de 66/108 do lado);
    # o Android mostra só os 72 dp centrais da camada de 108 dp, onde o triângulo fica
    # com ~48% da largura visível.
    glyph(SIZE, 0.16).save(OUT / 'android-icon-foreground.png')
    # Android 13+ tinge o monocromático com a cor do tema; só a forma importa.
    glyph(SIZE, 0.16).save(OUT / 'android-icon-monochrome.png')
    # Splash: só o símbolo, ocupando a imagem; o tamanho na tela vem de imageWidth.
    glyph(512, 0.48).save(OUT / 'splash-icon.png')
    glyph(48, 0.2, BLACK).save(OUT / 'favicon.png')


if __name__ == '__main__':
    main()
