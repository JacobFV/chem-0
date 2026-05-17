"""pH (top) + resistance kΩ (bottom), colored by pH, minimal chrome."""
import os, numpy as np, matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.collections import LineCollection
from matplotlib.colors import Normalize, LinearSegmentedColormap

plt.rcParams.update({
    "figure.facecolor": "#0e1117",
    "axes.facecolor":   "#171b22",
    "axes.edgecolor":   "#3a414d",
    "axes.labelcolor":  "#d6dbe4",
    "xtick.color":      "#9aa3b2",
    "ytick.color":      "#9aa3b2",
    "axes.titlecolor":  "#ffffff",
    "axes.labelsize":   14,
    "axes.labelweight": "semibold",
    "font.family": "DejaVu Sans",
    "font.size": 11,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "grid.color": "#262b34",
    "grid.linewidth": 0.5,
})

rng = np.random.default_rng(3)
N = 25
target_pH, target_R = 7.50, 3.00

# LLM-reasoning phase (trials 0-4): wide exploration
pH = [6.21, 9.05, 4.84, 8.41, 7.11]
R  = [18.42, 22.10, 15.74, 19.34, 12.63]

# BO phase (trials 5-24): exponential convergence with noise
for i in range(5, N):
    p = (i - 5) / (N - 6)
    pH.append(target_pH + max(0.45, 1.30 * np.exp(-p * 1.8)) * rng.standard_normal())
    R.append(max(2.5, (15.0 * np.exp(-p * 2.6) + target_R) + 0.55 * (1 - 0.6 * p) * rng.standard_normal()))

pH = np.round(np.array(pH), 2)
R  = np.round(np.array(R),  2)
trials = np.arange(1, N + 1)

# Bromothymol blue colors (lab-accurate at each pH)
cmap = LinearSegmentedColormap.from_list("bromothymol", [
    (0.00, "#FDE047"),  # pH ≤ 6.0  bright lemon yellow
    (0.25, "#BEF264"),  # pH 6.4    chartreuse
    (0.45, "#4ADE80"),  # pH 6.7    light green
    (0.60, "#14B8A6"),  # pH 7.0    teal
    (0.78, "#0EA5E9"),  # pH 7.3    cyan-blue
    (1.00, "#1E3A8A"),  # pH ≥ 7.6  deep blue
])
norm = Normalize(vmin=6.0, vmax=7.6)   # BB's useful range; clips outside


fig = plt.figure(figsize=(13, 7), dpi=110)
gs  = fig.add_gridspec(2, 1, hspace=0.12, left=0.08, right=0.96, top=0.92, bottom=0.10)
ax1 = fig.add_subplot(gs[0])
ax2 = fig.add_subplot(gs[1], sharex=ax1)
fig.text(0.08, 0.96, "Bayesian Optimization", fontsize=20, fontweight="bold", color="white")

def draw(t):
    ax1.clear(); ax2.clear()
    n = t + 1
    xs, ph_n, r_n = trials[:n], pH[:n], R[:n]
    for ax, y in [(ax1, ph_n), (ax2, r_n)]:
        ax.set_facecolor("#171b22")
        ax.grid(True, alpha=0.5)
        ax.plot(xs, y, color="#cbd5e1", lw=1.6, alpha=0.45, zorder=2)
        ax.scatter(xs, y, c=ph_n, cmap=cmap, norm=norm,
                   s=85, edgecolors="white", linewidths=0.6, zorder=3)
        ax.scatter(xs[-1], y[-1], s=320, facecolors="none",
                   edgecolors="#f59e0b", linewidths=2.6, zorder=5)


    # pH target band (wider — reflects ±0.5 inference uncertainty)
    ax1.axhspan(target_pH - 0.5, target_pH + 0.5, color="#22c55e", alpha=0.14, zorder=0)
    ax1.axhline(target_pH, color="#22c55e", lw=0.8, ls="--", alpha=0.6, zorder=1)

    ax1.set_ylabel("pH")
    ax2.set_ylabel("resistance  [kΩ]")
    ax2.set_xlabel("trial")
    ax1.set_xlim(0.3, N + 0.7)
    ax1.set_ylim(3.5, 10.0)
    ax2.set_ylim(1.5, 24.5)
    ax1.tick_params(labelbottom=False)

    # current values, big, top right
    ax1.text(0.985, 0.92, f"pH  {pH[t]:.2f}", transform=ax1.transAxes,
             ha="right", va="top", color="white", fontsize=18,
             fontweight="bold", family="DejaVu Sans Mono")
    ax2.text(0.985, 0.92, f"R   {R[t]:.2f} kΩ", transform=ax2.transAxes,
             ha="right", va="top", color="white", fontsize=18,
             fontweight="bold", family="DejaVu Sans Mono")

# hold final
total = N + 8
anim = FuncAnimation(fig, lambda i: draw(min(i, N - 1)),
                     frames=total, interval=420, repeat=False)
out_gif = "/tmp/ph_bo_demo/08_two_obj_v2.gif"
anim.save(out_gif, writer=PillowWriter(fps=2.5), dpi=110)
plt.close()
print(f"wrote {out_gif} ({os.path.getsize(out_gif)/1024:.0f} KB)")
print(f"pH final: {pH[-1]:.2f}   R final: {R[-1]:.2f} kΩ")
print(f"pH:  {list(pH)}")
print(f"R:   {list(R)}")
