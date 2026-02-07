from typing import List

def decode_54bytes_to_samples(bb: bytes) -> List[int]:
    """Decode 54 bytes into 36 signed samples (12-bit), matching vendor C# DataBuild()."""
    if len(bb) != 54:
        raise ValueError(f"Expected 54 bytes, got {len(bb)}")

    out: List[int] = []
    for i in range(0, 54, 3):
        b0 = bb[i]
        b1 = bb[i + 1]
        b2 = bb[i + 2]

        v1 = (((b2 << 4) & 0x0F00) | b0) - 2048
        v2 = (((b2 << 8) & 0x0F00) | b1) - 2048
        out.append(v1)
        out.append(v2)
    return out
