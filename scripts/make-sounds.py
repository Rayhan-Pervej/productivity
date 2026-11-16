# Run: python scripts/make-sounds.py  (regenerates public/sounds/*.wav)
# Synthesizes Wholeday's notification sounds (original, license-free).
# Each sound = notes made of a few partials with smooth attack and exponential decay.
import math, os, random, struct, wave

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "sounds")
os.makedirs(OUT, exist_ok=True)


def note(freq, start, dur, partials, decay, attack=0.004, gain=1.0):
    """A list of (time, value) contributions is too slow; return a function sample(t)."""
    def sample(t):
        t -= start
        if t < 0 or t > dur:
            return 0.0
        env = min(1.0, t / attack) * math.exp(-t / decay)
        # soften the very end so nothing clicks
        tail = min(1.0, (dur - t) / 0.03)
        v = 0.0
        for ratio, amp, pdecay in partials:
            v += amp * math.exp(-t / pdecay) * math.sin(2 * math.pi * freq * ratio * t)
        return gain * env * tail * v
    return sample


def render(name, voices, length, peak=0.55):
    n = int(RATE * length)
    data = [sum(v(i / RATE) for v in voices) for i in range(n)]
    top = max(1e-9, max(abs(x) for x in data))
    scale = peak / top
    frames = b"".join(struct.pack("<h", int(max(-1, min(1, x * scale)) * 32767)) for x in data)
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    print(f"{name}.wav  {length:.2f}s  {len(frames) // 1024} KB")


# Partial set for "done": (frequency ratio, amplitude, own decay seconds)
PLUCK = [(1.0, 1.0, 0.25), (2.0, 0.5, 0.12), (3.0, 0.25, 0.07)]
G5, D6 = 783.99, 1174.66

# ---- Marimba, refined: wooden mallet knock + resonant body + a little room ----


def mallet(start, gain=0.25, length=0.012, seed=1):
    """The soft 'knock' of a felt mallet: a tiny low-passed noise burst."""
    rnd = random.Random(seed)
    n = int(RATE * length)
    buf, prev = [], 0.0
    for i in range(n):
        prev += 0.18 * (rnd.uniform(-1, 1) - prev)  # one-pole low-pass
        buf.append(prev * (1 - i / n) ** 2)
    def sample(t):
        i = int((t - start) * RATE)
        return gain * buf[i] if 0 <= i < n else 0.0
    return sample


def room(data, mix=0.16):
    """A small, soft room: a few damped comb filters (Schroeder style)."""
    out = list(data)
    for delay_ms, fb in ((29.7, 0.55), (37.1, 0.5), (41.1, 0.45), (43.7, 0.42)):
        d = int(RATE * delay_ms / 1000)
        buf = [0.0] * len(data)
        lp = 0.0
        for i in range(len(data)):
            past = buf[i - d] if i >= d else 0.0
            lp += 0.35 * (past - lp)  # darker tail
            buf[i] = data[i] + fb * lp
        for i in range(len(data)):
            out[i] += mix * 0.25 * buf[i]
    return out


def render_fx(name, voices, length, peak=0.55, mix=0.16):
    n = int(RATE * length)
    dry = [sum(v(i / RATE) for v in voices) for i in range(n)]
    data = room(dry, mix)
    fade = int(RATE * 0.05)  # gentle fade so the room tail never clicks
    for i in range(fade):
        data[n - 1 - i] *= i / fade
    top = max(1e-9, max(abs(x) for x in data))
    frames = b"".join(struct.pack("<h", int(max(-1, min(1, x * peak / top)) * 32767)) for x in data)
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(frames)
    print(f"{name}.wav  {length:.2f}s  {len(frames) // 1024} KB")


# Real marimba bars are tuned so the first overtone is 4x the note (and ~10x faintly);
# the resonator tube makes the fundamental ring longer and rounder.
WOOD = [(1.0, 1.0, 0.55), (4.0, 0.28, 0.07), (9.8, 0.05, 0.02), (2.0, 0.06, 0.25)]


def bar(freq, start, gain=1.0, ring=0.42, seed=1):
    return [note(freq, start, ring * 2.4, WOOD, ring, attack=0.002, gain=gain), mallet(start, 0.22 * gain, seed=seed)]


# Wholeday's reminder sound: two low, calm marimba notes (E4 then B4).
render_fx("marimba", bar(330.0, 0.0, 1.0, ring=0.5) + bar(494.4, 0.16, 0.85, ring=0.55, seed=2), 1.45, mix=0.2)

# "done": a short, bright two-note confirmation for completing something
render("done", [note(G5, 0.0, 0.35, PLUCK, 0.18, gain=0.8), note(D6, 0.07, 0.45, PLUCK, 0.22)], 0.55, peak=0.45)
