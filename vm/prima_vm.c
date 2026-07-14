/*
 * ════════════════════════════════════════════════════════════════
 * PRIMA VM — The First Spark
 * ════════════════════════════════════════════════════════════════
 *
 * A minimal bytecode interpreter for the Prima language.
 * 22 operations. <12+1D> coordinate space. Sigils as programs.
 *
 * No libc beyond syscall wrappers. No malloc. No printf.
 * Only: read, write, open, close, mmap, munmap, exit.
 *
 * This is the Nigredo — the black stage. The substrate.
 * Once Prima can compile itself, this file is discarded.
 *
 * "You start from the top, each line a command."
 * "Each graph contains the previous ones."
 *
 * Author: Alberto Valido Delgado
 * License: L7 WAY Proprietary
 * ════════════════════════════════════════════════════════════════
 */

#include <sys/types.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>

/* We write our own — no stdio, no stdlib */

typedef uint8_t   u8;
typedef uint16_t  u16;
typedef uint32_t  u32;
typedef int32_t   i32;
typedef uint64_t  u64;
typedef double    f64;

/* ──── Minimal I/O (syscalls only) ──── */

static void l7_write(int fd, const char *buf, int len) {
    write(fd, buf, len);
}

static int l7_strlen(const char *s) {
    int n = 0;
    while (s[n]) n++;
    return n;
}

static void l7_puts(const char *s) {
    l7_write(1, s, l7_strlen(s));
}

static void l7_err(const char *s) {
    l7_write(2, s, l7_strlen(s));
}

/* Integer to decimal string */
static void l7_putn(i32 n) {
    char buf[16];
    int i = 15;
    int neg = 0;
    if (n < 0) { neg = 1; n = -n; }
    if (n == 0) { buf[i--] = '0'; }
    while (n > 0) { buf[i--] = '0' + (n % 10); n /= 10; }
    if (neg) buf[i--] = '-';
    l7_write(1, buf + i + 1, 15 - i);
}

/* Fixed-point to string (2 decimal places) */
static void l7_putf(f64 v) {
    if (v < 0) { l7_puts("-"); v = -v; }
    i32 whole = (i32)v;
    i32 frac = (i32)((v - whole) * 100);
    l7_putn(whole);
    l7_puts(".");
    if (frac < 10) l7_puts("0");
    l7_putn(frac);
}

/* ════════════════════════════════════════════════════════════════
 * THE 22 OPERATIONS — Opcodes 0-21
 * ════════════════════════════════════════════════════════════════ */

#define OP_INVOKE       0   /* א Aleph   — Begin from nothing           */
#define OP_TRANSMUTE    1   /* ב Beth    — Pass through forge           */
#define OP_SEAL         2   /* ג Gimel   — Encrypt, make invisible      */
#define OP_DREAM        3   /* ד Daleth  — Enter .morph domain          */
#define OP_PUBLISH      4   /* ה He      — Stabilize in .work           */
#define OP_BIND         5   /* ו Vav     — Apply law/rule               */
#define OP_VERIFY       6   /* ז Zayin   — Authenticate                 */
#define OP_ORCHESTRATE  7   /* ח Cheth   — Coordinate flows             */
#define OP_REDEEM       8   /* ט Teth    — Transmute threat → citizen   */
#define OP_REFLECT      9   /* י Yod     — Self-examine                 */
#define OP_ROTATE      10   /* כ Kaph    — Cycle, evolve                */
#define OP_AUDIT       11   /* ל Lamed   — Log and trace                */
#define OP_DECOMPOSE   12   /* מ Mem     — Break into atoms             */
#define OP_TRANSITION  13   /* נ Nun     — Change domain                */
#define OP_TRANSLATE   14   /* ס Samekh  — Mediate between systems      */
#define OP_QUARANTINE  15   /* ע Ayin    — Isolate threat               */
#define OP_RECOVER     16   /* פ Pe      — Catastrophe response         */
#define OP_ASPIRE      17   /* צ Tzaddi  — Set highest vision           */
#define OP_SPECULATE   18   /* ק Qoph    — Explore shadows             */
#define OP_ILLUMINATE  19   /* ר Resh    — Clarify                      */
#define OP_SUCCEED     20   /* ש Shin    — Transfer authority           */
#define OP_COMPLETE    21   /* ת Tav     — Deliver                      */
#define OP_COUNT       22

static const char *OP_NAMES[OP_COUNT] = {
    "invoke", "transmute", "seal", "dream", "publish", "bind",
    "verify", "orchestrate", "redeem", "reflect", "rotate", "audit",
    "decompose", "transition", "translate", "quarantine", "recover",
    "aspire", "speculate", "illuminate", "succeed", "complete"
};

static const char *OP_LETTERS[OP_COUNT] = {
    "Aleph", "Beth", "Gimel", "Daleth", "He", "Vav",
    "Zayin", "Cheth", "Teth", "Yod", "Kaph", "Lamed",
    "Mem", "Nun", "Samekh", "Ayin", "Pe", "Tzaddi",
    "Qoph", "Resh", "Shin", "Tav"
};

/* ════════════════════════════════════════════════════════════════
 * THE 12+1D COORDINATE — The Dodecahedron Address
 * ════════════════════════════════════════════════════════════════ */

#define DIMS 12

static const char *DIM_NAMES[DIMS] = {
    "capability", "data", "presentation", "persistence",
    "security", "detail", "output", "intention",
    "consciousness", "transformation", "direction", "memory"
};

static const char *DIM_PLANETS[DIMS] = {
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter",
    "Saturn", "Uranus", "Neptune", "Pluto", "NNode", "SNode"
};

/* A coordinate: 12 dimensions (0.0-10.0 each) + astrocyte (0.0-1.0) */
typedef struct {
    f64 v[DIMS];        /* 12D position */
    f64 astrocyte;      /* 13th meta-variable */
} Coord;

/* Euclidean distance in 12D */
static f64 coord_distance(const Coord *a, const Coord *b) {
    f64 sum = 0;
    for (int i = 0; i < DIMS; i++) {
        f64 d = a->v[i] - b->v[i];
        sum += d * d;
    }
    /* Integer square root approximation (no libm) */
    f64 x = sum;
    f64 y = 1.0;
    while (x - y > 0.001) {
        x = (x + y) / 2;
        y = sum / x;
    }
    return x;
}

/* Cosine similarity in 12D */
static f64 coord_similarity(const Coord *a, const Coord *b) {
    f64 dot = 0, ma = 0, mb = 0;
    for (int i = 0; i < DIMS; i++) {
        dot += a->v[i] * b->v[i];
        ma += a->v[i] * a->v[i];
        mb += b->v[i] * b->v[i];
    }
    /* Sqrt approximation */
    f64 sma = ma, sy = 1.0;
    while (sma - sy > 0.001) { sma = (sma + sy) / 2; sy = ma / sma; }
    f64 smb = mb;
    sy = 1.0;
    while (smb - sy > 0.001) { smb = (smb + sy) / 2; sy = mb / smb; }
    if (sma < 0.001 || smb < 0.001) return 0;
    return dot / (sma * smb);
}

/* Weighted addition: c = a + scale * b */
static void coord_add(Coord *c, const Coord *a, const Coord *b, f64 scale) {
    for (int i = 0; i < DIMS; i++) {
        c->v[i] = a->v[i] + b->v[i] * scale;
        if (c->v[i] < 0) c->v[i] = 0;
        if (c->v[i] > 10) c->v[i] = 10;
    }
    c->astrocyte = a->astrocyte;
}

static void coord_print(const Coord *c) {
    l7_puts("[");
    for (int i = 0; i < DIMS; i++) {
        if (i > 0) l7_puts(",");
        l7_putf(c->v[i]);
    }
    l7_puts("] *");
    l7_putf(c->astrocyte);
}

/* ════════════════════════════════════════════════════════════════
 * THE FIELD — All wave-particles live here
 * ════════════════════════════════════════════════════════════════ */

#define MAX_PARTICLES 1024
#define MAX_EDGES     4096

typedef struct {
    Coord   pos;            /* 12D position */
    Coord   momentum;       /* 12D momentum */
    u8      alive;          /* 1 = exists, 0 = destroyed */
    u8      domain;         /* 0=morph, 1=work, 2=salt, 3=vault */
    u8      sealed;         /* 1 = encrypted */
    u32     id;             /* Unique particle ID */
} Particle;

typedef struct {
    u16     from;           /* Source particle index */
    u16     to;             /* Target particle index */
    Coord   weights;        /* 12D edge weights */
} Edge;

typedef struct {
    Particle particles[MAX_PARTICLES];
    Edge     edges[MAX_EDGES];
    u32      n_particles;
    u32      n_edges;
    u32      next_id;

    /* Perceptron state */
    f64      global_astrocyte;  /* System-wide uncertainty */
    f64      prediction_error;  /* Last prediction error */
    u64      tick;              /* Execution counter */
} Field;

static Field FIELD;  /* The one field — all of reality */

/* Create a new particle in the field */
static int field_create(Coord *pos) {
    if (FIELD.n_particles >= MAX_PARTICLES) return -1;
    int idx = FIELD.n_particles++;
    Particle *p = &FIELD.particles[idx];
    p->pos = *pos;
    for (int i = 0; i < DIMS; i++) p->momentum.v[i] = 0;
    p->momentum.astrocyte = 0;
    p->alive = 1;
    p->domain = 0;  /* Born in .morph */
    p->sealed = 0;
    p->id = FIELD.next_id++;
    return idx;
}

/* Create an edge between two particles */
static int field_connect(u16 from, u16 to, Coord *weights) {
    if (FIELD.n_edges >= MAX_EDGES) return -1;
    int idx = FIELD.n_edges++;
    Edge *e = &FIELD.edges[idx];
    e->from = from;
    e->to = to;
    e->weights = *weights;
    return idx;
}

/* Find particle by coordinate similarity (nearest neighbor) */
static int field_find(Coord *query) {
    int best = -1;
    f64 best_sim = -1;
    for (u32 i = 0; i < FIELD.n_particles; i++) {
        if (!FIELD.particles[i].alive) continue;
        f64 sim = coord_similarity(query, &FIELD.particles[i].pos);
        if (sim > best_sim) {
            best_sim = sim;
            best = i;
        }
    }
    return best;
}

/* ════════════════════════════════════════════════════════════════
 * SIGIL BYTECODE FORMAT
 * ════════════════════════════════════════════════════════════════
 *
 * Header: 16 bytes
 *   [0-3]   Magic:     "L7PR" (0x4C375052)
 *   [4-5]   Version:   0x0001
 *   [6]     Flags:     bit0=sealed, bit1=audited, bit2=morph
 *   [7]     N_ops:     number of operations
 *   [8-9]   N_edges:   number of edges
 *   [10-11] Astrocyte: uint16 (0-65535 → 0.0-1.0)
 *   [12-15] Reserved
 *
 * Operations: N_ops × 2 bytes each
 *   [0]     Opcode:    0-21
 *   [1]     Flags:     bit0=break, bit1=trace
 *
 * Edges: N_edges × 14 bytes each
 *   [0]     From:      operation index
 *   [1]     To:        operation index
 *   [2-13]  Weights:   12 bytes (each 0-255, maps to 0.0-10.0)
 * ════════════════════════════════════════════════════════════════ */

#define MAGIC_L7PR 0x4C375052

typedef struct {
    u32 magic;
    u16 version;
    u8  flags;
    u8  n_ops;
    u16 n_edges;
    u16 astrocyte;
    u32 reserved;
} SigilHeader;

typedef struct {
    u8 opcode;
    u8 flags;
} SigilOp;

typedef struct {
    u8 from;
    u8 to;
    u8 weights[DIMS];  /* 0-255 each → 0.0-10.0 */
} SigilEdge;

typedef struct {
    SigilHeader header;
    SigilOp     ops[256];
    SigilEdge   edges[256];
    int         loaded;
} Sigil;

/* ════════════════════════════════════════════════════════════════
 * SIGIL LOADER — Read bytecode from file or memory
 * ════════════════════════════════════════════════════════════════ */

static int sigil_load(Sigil *s, const u8 *data, u32 size) {
    if (size < 16) return -1;

    /* Parse header */
    s->header.magic = (u32)data[0] | ((u32)data[1] << 8) |
                      ((u32)data[2] << 16) | ((u32)data[3] << 24);
    if (s->header.magic != MAGIC_L7PR) {
        /* Try big-endian */
        s->header.magic = ((u32)data[0] << 24) | ((u32)data[1] << 16) |
                          ((u32)data[2] << 8) | (u32)data[3];
        if (s->header.magic != MAGIC_L7PR) return -2;  /* Bad magic */
    }

    s->header.version   = data[4] | (data[5] << 8);
    s->header.flags     = data[6];
    s->header.n_ops     = data[7];
    s->header.n_edges   = data[8] | (data[9] << 8);
    s->header.astrocyte = data[10] | (data[11] << 8);

    if (s->header.n_edges > 256) return -5;  /* Too many edges for fixed-size edges[256] */

    u32 expected = 16 + s->header.n_ops * 2 + s->header.n_edges * 14;
    if (size < expected) return -3;  /* Truncated */

    /* Parse operations */
    const u8 *p = data + 16;
    for (int i = 0; i < s->header.n_ops; i++) {
        s->ops[i].opcode = p[0];
        s->ops[i].flags  = p[1];
        if (s->ops[i].opcode >= OP_COUNT) return -4;  /* Bad opcode */
        p += 2;
    }

    /* Parse edges */
    for (int i = 0; i < s->header.n_edges; i++) {
        s->edges[i].from = p[0];
        s->edges[i].to   = p[1];
        for (int d = 0; d < DIMS; d++) {
            s->edges[i].weights[d] = p[2 + d];
        }
        p += 14;
    }

    s->loaded = 1;
    return 0;
}

/* Load sigil from file */
static int sigil_load_file(Sigil *s, const char *path) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) return -1;

    struct stat st;
    if (fstat(fd, &st) < 0) { close(fd); return -1; }

    void *data = mmap(0, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    close(fd);
    if (data == MAP_FAILED) return -1;

    int result = sigil_load(s, (const u8 *)data, st.st_size);
    munmap(data, st.st_size);
    return result;
}

/* ════════════════════════════════════════════════════════════════
 * THE EXECUTOR — Run a sigil on the field
 * ════════════════════════════════════════════════════════════════
 *
 * Execution model:
 *   1. Create a particle at the sigil's astrocyte level
 *   2. For each operation, transform the particle
 *   3. Edge weights modulate how each transformation applies
 *   4. The perceptron observes and adjusts the field
 *   5. COMPLETE collapses the particle and delivers the result
 * ════════════════════════════════════════════════════════════════ */

/* Execution context: the "current wave-particle" being transformed */
typedef struct {
    int         particle_idx;   /* Index into FIELD.particles */
    Coord       accumulator;    /* Working coordinate */
    u8          stage;          /* 0=nigredo, 1=albedo, 2=citrinitas, 3=rubedo */
    u8          halted;
    u8          error;
    u32         ip;             /* Instruction pointer (operation index) */
    u32         audit_count;    /* Number of audited steps */
} ExecCtx;

/* Determine alchemical stage from operation type */
static u8 op_stage(u8 opcode) {
    switch (opcode) {
        case OP_INVOKE: case OP_DECOMPOSE: case OP_QUARANTINE:
            return 0;  /* Nigredo: dissolution */
        case OP_VERIFY: case OP_AUDIT: case OP_BIND: case OP_REFLECT:
            return 1;  /* Albedo: purification */
        case OP_TRANSMUTE: case OP_DREAM: case OP_SPECULATE:
        case OP_ASPIRE: case OP_ILLUMINATE:
            return 2;  /* Citrinitas: enlightenment */
        case OP_PUBLISH: case OP_COMPLETE: case OP_SUCCEED:
        case OP_ORCHESTRATE: case OP_RECOVER:
            return 3;  /* Rubedo: completion */
        default:
            return 1;
    }
}

/* Get the edge weights for current operation transition */
static Coord edge_weights(const Sigil *s, u32 from_op, u32 to_op) {
    Coord w;
    for (int i = 0; i < DIMS; i++) w.v[i] = 0;
    w.astrocyte = 0;

    for (int i = 0; i < s->header.n_edges; i++) {
        if (s->edges[i].from == from_op && s->edges[i].to == to_op) {
            for (int d = 0; d < DIMS; d++) {
                w.v[d] = (f64)s->edges[i].weights[d] / 25.5;  /* 0-255 → 0-10 */
            }
            break;
        }
    }
    return w;
}

/* Execute a single operation */
static void exec_op(ExecCtx *ctx, const Sigil *s, u8 opcode, const Coord *weights) {
    Particle *p = &FIELD.particles[ctx->particle_idx];
    f64 scale;

    switch (opcode) {

    case OP_INVOKE:
        /* Begin: set initial position directly from weights */
        for (int i = 0; i < DIMS; i++) {
            p->pos.v[i] = weights->v[i];
        }
        p->pos.astrocyte = (f64)s->header.astrocyte / 65535.0;
        break;

    case OP_TRANSMUTE:
        /* Transform: rotate position toward weights */
        scale = weights->v[9] / 10.0;  /* Transformation dimension controls intensity */
        if (scale < 0.1) scale = 0.5;
        coord_add(&ctx->accumulator, &p->pos, weights, scale);
        p->pos = ctx->accumulator;
        break;

    case OP_SEAL:
        /* Encrypt: set sealed flag, increase security dimension */
        p->sealed = 1;
        p->pos.v[4] = 10.0;  /* Mars = maximum security */
        p->pos.astrocyte *= 0.5;  /* Reduce uncertainty */
        break;

    case OP_DREAM:
        /* Enter .morph: increase astrocyte, shift to creative dimensions */
        p->domain = 0;
        p->pos.astrocyte = 0.6;
        p->pos.v[8] += 3;  /* Boost consciousness */
        if (p->pos.v[8] > 10) p->pos.v[8] = 10;
        break;

    case OP_PUBLISH:
        /* Stabilize in .work: collapse uncertainty, fix output */
        p->domain = 1;
        p->pos.astrocyte *= 0.3;
        p->pos.v[6] = weights->v[6] > 0 ? weights->v[6] : 7;  /* Set output */
        break;

    case OP_BIND:
        /* Apply rule: constrain dimensions by weights */
        for (int i = 0; i < DIMS; i++) {
            if (weights->v[i] > 5) {
                /* Binding: pull toward the weight value */
                p->pos.v[i] = (p->pos.v[i] + weights->v[i]) / 2;
            }
        }
        break;

    case OP_VERIFY:
        /* Authenticate: check alignment between particle and edge weights */
        /* Verification passes if the particle's position is coherent with
           the dimensions the edge cares about (cosine similarity) */
        {
            f64 sim = coord_similarity(&p->pos, weights);
            if (sim > 0.1) {
                /* Verified — reduce uncertainty proportional to alignment */
                p->pos.astrocyte *= (1.0 - sim * 0.5);
            } else {
                ctx->error = 1;  /* Verification failed — incoherent */
                ctx->halted = 1;
            }
        }
        break;

    case OP_ORCHESTRATE:
        /* Coordinate: blend multiple dimensions toward balance */
        for (int i = 0; i < DIMS; i++) {
            f64 target = weights->v[i];
            if (target > 0) {
                p->pos.v[i] = p->pos.v[i] * 0.6 + target * 0.4;
            }
        }
        break;

    case OP_REDEEM:
        /* Transmute threat: invert quarantine, boost transformation */
        p->pos.v[9] += 3;  /* Boost transformation */
        if (p->pos.v[9] > 10) p->pos.v[9] = 10;
        p->pos.v[4] = (p->pos.v[4] + 5) / 2;  /* Moderate security */
        p->pos.astrocyte *= 0.5;
        break;

    case OP_REFLECT:
        /* Self-examine: compute self-similarity, adjust astrocyte */
        {
            f64 self_sim = coord_similarity(&p->pos, &ctx->accumulator);
            /* High self-similarity = stable = reduce astrocyte */
            /* Low self-similarity = changing = increase astrocyte */
            p->pos.astrocyte = p->pos.astrocyte * 0.8 + (1.0 - self_sim) * 0.2;
        }
        break;

    case OP_ROTATE:
        /* Cycle: shift all dimensions by one position */
        {
            f64 tmp = p->pos.v[DIMS - 1];
            for (int i = DIMS - 1; i > 0; i--) {
                p->pos.v[i] = p->pos.v[i - 1];
            }
            p->pos.v[0] = tmp;
        }
        break;

    case OP_AUDIT:
        /* Log: record current state (write to stderr) */
        ctx->audit_count++;
        l7_err("  AUDIT[");
        l7_putn(ctx->audit_count);
        l7_err("] ");
        coord_print(&p->pos);
        l7_err("\n");
        break;

    case OP_DECOMPOSE:
        /* Break into atoms: zero all dimensions below weight threshold */
        for (int i = 0; i < DIMS; i++) {
            if (weights->v[i] < 3) p->pos.v[i] = 0;
        }
        p->pos.astrocyte = 0.8;  /* High uncertainty after decomposition */
        break;

    case OP_TRANSITION:
        /* Change domain */
        {
            u8 new_domain = 0;
            f64 max_w = 0;
            /* Domain determined by which weight is highest:
               v[8] consciousness → .morph
               v[0] capability    → .work
               v[11] memory       → .salt
               v[4] security      → .vault */
            if (weights->v[8] > max_w) { max_w = weights->v[8]; new_domain = 0; }
            if (weights->v[0] > max_w) { max_w = weights->v[0]; new_domain = 1; }
            if (weights->v[11] > max_w) { max_w = weights->v[11]; new_domain = 2; }
            if (weights->v[4] > max_w) { max_w = weights->v[4]; new_domain = 3; }
            p->domain = new_domain;
        }
        break;

    case OP_TRANSLATE:
        /* Mediate: average position with weights */
        for (int i = 0; i < DIMS; i++) {
            p->pos.v[i] = (p->pos.v[i] + weights->v[i]) / 2;
        }
        break;

    case OP_QUARANTINE:
        /* Isolate: zero all edges, set high security */
        p->pos.v[4] = 9;
        p->pos.v[0] = 0;  /* Zero capability */
        p->pos.v[6] = 0;  /* Zero output */
        break;

    case OP_RECOVER:
        /* Catastrophe response: restore from accumulator */
        p->pos = ctx->accumulator;
        p->pos.astrocyte = 0.5;  /* Moderate uncertainty */
        break;

    case OP_ASPIRE:
        /* Set highest vision: max out direction and intention */
        p->pos.v[7] = 10;  /* Max intention */
        p->pos.v[10] = 10; /* Max direction */
        break;

    case OP_SPECULATE:
        /* Explore shadows: increase astrocyte, boost consciousness */
        p->pos.astrocyte = 0.7;
        p->pos.v[8] += 2;
        if (p->pos.v[8] > 10) p->pos.v[8] = 10;
        break;

    case OP_ILLUMINATE:
        /* Clarify: reduce astrocyte, boost presentation */
        p->pos.astrocyte *= 0.3;
        p->pos.v[2] += 3;
        if (p->pos.v[2] > 10) p->pos.v[2] = 10;
        break;

    case OP_SUCCEED:
        /* Transfer authority: copy position to another particle */
        /* For now: create a new particle with current position */
        {
            Coord newpos = p->pos;
            newpos.astrocyte = 0.1;  /* High certainty transfer */
            field_create(&newpos);
        }
        break;

    case OP_COMPLETE:
        /* Deliver: collapse to deterministic, halt */
        p->pos.astrocyte = 0;
        ctx->halted = 1;
        break;
    }

    /* Update alchemical stage */
    ctx->stage = op_stage(opcode);
    FIELD.tick++;
}

/* Execute an entire sigil */
static int exec_sigil(const Sigil *s) {
    if (!s->loaded || s->header.n_ops == 0) return -1;

    /* Create initial particle */
    Coord initial;
    for (int i = 0; i < DIMS; i++) initial.v[i] = 0;
    initial.astrocyte = (f64)s->header.astrocyte / 65535.0;

    int pidx = field_create(&initial);
    if (pidx < 0) return -2;

    /* Initialize execution context */
    ExecCtx ctx;
    ctx.particle_idx = pidx;
    ctx.accumulator = initial;
    ctx.stage = 0;
    ctx.halted = 0;
    ctx.error = 0;
    ctx.ip = 0;
    ctx.audit_count = 0;

    /* Print sigil header */
    l7_puts("=== SIGIL EXECUTION ===\n");
    l7_puts("  Operations: ");
    l7_putn(s->header.n_ops);
    l7_puts("\n  Edges: ");
    l7_putn(s->header.n_edges);
    l7_puts("\n  Astrocyte: ");
    l7_putf(initial.astrocyte);
    l7_puts("\n\n");

    /* Execute each operation */
    for (ctx.ip = 0; ctx.ip < s->header.n_ops && !ctx.halted; ctx.ip++) {
        u8 opcode = s->ops[ctx.ip].opcode;
        u8 trace = s->ops[ctx.ip].flags & 2;

        /* Get edge weights for this transition */
        Coord weights;
        for (int i = 0; i < DIMS; i++) weights.v[i] = 0;
        weights.astrocyte = 0;
        if (ctx.ip == 0 && s->header.n_ops > 1) {
            /* Invoke: use outgoing edge (0→1) as initial weights */
            weights = edge_weights(s, 0, 1);
        } else if (ctx.ip > 0) {
            weights = edge_weights(s, ctx.ip - 1, ctx.ip);
        }

        /* Save accumulator before operation */
        ctx.accumulator = FIELD.particles[pidx].pos;

        /* Trace output */
        if (trace || (s->header.flags & 2)) {
            static const char *stages[] = { "NIGREDO", "ALBEDO", "CITRINITAS", "RUBEDO" };
            l7_puts("  [");
            l7_putn(ctx.ip);
            l7_puts("] ");
            l7_puts(OP_LETTERS[opcode]);
            l7_puts(" (");
            l7_puts(OP_NAMES[opcode]);
            l7_puts(") — ");
            l7_puts(stages[op_stage(opcode)]);
            l7_puts("\n");
        }

        /* Execute */
        exec_op(&ctx, s, opcode, &weights);

        /* Perceptron feedback: compare predicted vs actual */
        if (ctx.ip > 0) {
            f64 err = coord_distance(&ctx.accumulator, &FIELD.particles[pidx].pos);
            FIELD.prediction_error = FIELD.prediction_error * 0.9 + err * 0.1;
            /* Self-modulate global astrocyte */
            f64 delta = (err / 20.0 - FIELD.global_astrocyte) * 0.1;
            FIELD.global_astrocyte += delta;
            if (FIELD.global_astrocyte < 0.01) FIELD.global_astrocyte = 0.01;
            if (FIELD.global_astrocyte > 0.99) FIELD.global_astrocyte = 0.99;
        }
    }

    /* Print result */
    Particle *final = &FIELD.particles[pidx];
    l7_puts("\n=== RESULT ===\n");
    l7_puts("  Coordinate: ");
    coord_print(&final->pos);
    l7_puts("\n  Domain: ");
    static const char *domains[] = { ".morph", ".work", ".salt", ".vault" };
    l7_puts(domains[final->domain]);
    l7_puts("\n  Sealed: ");
    l7_puts(final->sealed ? "yes" : "no");
    l7_puts("\n  Stage: ");
    static const char *stages[] = { "NIGREDO", "ALBEDO", "CITRINITAS", "RUBEDO" };
    l7_puts(stages[ctx.stage]);
    l7_puts("\n  Error: ");
    l7_puts(ctx.error ? "HALTED" : "none");
    l7_puts("\n  Field: ");
    l7_putn(FIELD.n_particles);
    l7_puts(" particles, ");
    l7_putn(FIELD.n_edges);
    l7_puts(" edges, tick ");
    l7_putn((i32)FIELD.tick);
    l7_puts("\n  Perceptron error: ");
    l7_putf(FIELD.prediction_error);
    l7_puts("\n  Global astrocyte: ");
    l7_putf(FIELD.global_astrocyte);
    l7_puts("\n");

    return ctx.error ? -3 : 0;
}

/* ════════════════════════════════════════════════════════════════
 * SIGIL ASSEMBLER — Text notation → Bytecode
 * ════════════════════════════════════════════════════════════════
 *
 * Input format (one operation per line):
 *   opname [dim=val dim=val ...]
 *
 * Example:
 *   invoke capability=8 security=7
 *   decompose security=9 detail=9
 *   verify security=10
 *   complete
 * ════════════════════════════════════════════════════════════════ */

static int find_op_by_name(const char *name, int len) {
    for (int i = 0; i < OP_COUNT; i++) {
        const char *on = OP_NAMES[i];
        int j = 0;
        while (j < len && on[j] && name[j] == on[j]) j++;
        if (j == len && on[j] == '\0') return i;
    }
    return -1;
}

static int find_dim_by_name(const char *name, int len) {
    for (int i = 0; i < DIMS; i++) {
        const char *dn = DIM_NAMES[i];
        int j = 0;
        while (j < len && dn[j] && name[j] == dn[j]) j++;
        if (j == len && dn[j] == '\0') return i;
    }
    return -1;
}

static int parse_int(const char *s, int len) {
    int v = 0;
    for (int i = 0; i < len; i++) {
        if (s[i] >= '0' && s[i] <= '9') v = v * 10 + (s[i] - '0');
    }
    return v;
}

/* Assemble text into bytecode buffer. Returns size or -1 on error. */
static int assemble(const char *text, int textlen, u8 *out, int outmax) {
    u8 opcodes[256];
    u8 edge_weights_buf[256][DIMS];
    int n_ops = 0;

    /* Initialize all weights to zero */
    for (int i = 0; i < 256; i++)
        for (int d = 0; d < DIMS; d++)
            edge_weights_buf[i][d] = 0;

    /* Parse line by line */
    int pos = 0;
    while (pos < textlen && n_ops < 256) {
        /* Skip whitespace and empty lines */
        while (pos < textlen && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\r')) pos++;
        if (pos >= textlen) break;
        if (text[pos] == '\n') { pos++; continue; }
        if (text[pos] == '#') { while (pos < textlen && text[pos] != '\n') pos++; continue; }

        /* Read operation name */
        int name_start = pos;
        while (pos < textlen && text[pos] != ' ' && text[pos] != '\t' && text[pos] != '\n' && text[pos] != '\r')
            pos++;
        int name_len = pos - name_start;

        int op = find_op_by_name(text + name_start, name_len);
        if (op < 0) {
            l7_err("Unknown operation: ");
            l7_write(2, text + name_start, name_len);
            l7_err("\n");
            return -1;
        }
        opcodes[n_ops] = op;

        /* Read dimension=value pairs */
        while (pos < textlen && text[pos] != '\n') {
            while (pos < textlen && (text[pos] == ' ' || text[pos] == '\t')) pos++;
            if (pos >= textlen || text[pos] == '\n') break;

            int dim_start = pos;
            while (pos < textlen && text[pos] != '=') pos++;
            int dim_len = pos - dim_start;
            if (pos >= textlen || text[pos] != '=') break;
            pos++;  /* skip = */

            int val_start = pos;
            while (pos < textlen && text[pos] >= '0' && text[pos] <= '9') pos++;
            int val_len = pos - val_start;

            int dim = find_dim_by_name(text + dim_start, dim_len);
            if (dim >= 0 && val_len > 0) {
                int val = parse_int(text + val_start, val_len);
                if (val > 10) val = 10;
                edge_weights_buf[n_ops][dim] = (u8)(val * 25);  /* 0-10 → 0-250 */
            }
        }

        n_ops++;
        if (pos < textlen && text[pos] == '\n') pos++;
    }

    if (n_ops == 0) return -1;

    /* Build bytecode */
    int n_edges = n_ops > 1 ? n_ops - 1 : 0;
    int total = 16 + n_ops * 2 + n_edges * 14;
    if (total > outmax) return -1;

    /* Header */
    out[0] = 'L'; out[1] = '7'; out[2] = 'P'; out[3] = 'R';
    out[4] = 0x01; out[5] = 0x00;  /* Version 1 */
    out[6] = 0x02;  /* Flags: audited (trace all) */
    out[7] = (u8)n_ops;
    out[8] = (u8)(n_edges & 0xFF); out[9] = (u8)(n_edges >> 8);
    out[10] = 0x00; out[11] = 0x4C; /* Astrocyte ~0.3 (0x4C00/65535) */
    out[12] = out[13] = out[14] = out[15] = 0;

    /* Operations */
    u8 *p = out + 16;
    for (int i = 0; i < n_ops; i++) {
        p[0] = opcodes[i];
        p[1] = 0x02;  /* Trace flag */
        p += 2;
    }

    /* Edges (from each operation to the next) */
    /* Edge i→i+1 carries the weights defined on line i (the SOURCE operation) */
    for (int i = 0; i < n_edges; i++) {
        p[0] = (u8)i;
        p[1] = (u8)(i + 1);
        for (int d = 0; d < DIMS; d++) {
            p[2 + d] = edge_weights_buf[i][d];  /* Weights from the SOURCE op */
        }
        p += 14;
    }

    return total;
}

/* ════════════════════════════════════════════════════════════════
 * MAIN — Entry point
 * ════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   prima run <sigil.l7b>         — execute compiled sigil
 *   prima asm <source.prima>      — assemble to bytecode and run
 *   prima info <sigil.l7b>        — print sigil info
 *   prima field                   — print field state
 * ════════════════════════════════════════════════════════════════ */

static int streq(const char *a, const char *b) {
    while (*a && *b && *a == *b) { a++; b++; }
    return *a == *b;
}

int main(int argc, char **argv) {
    /* Initialize field */
    FIELD.n_particles = 0;
    FIELD.n_edges = 0;
    FIELD.next_id = 1;
    FIELD.global_astrocyte = 0.3;
    FIELD.prediction_error = 0;
    FIELD.tick = 0;

    l7_puts("\n");
    l7_puts("  ╔══════════════════════════════════════╗\n");
    l7_puts("  ║   PRIMA VM — The First Spark         ║\n");
    l7_puts("  ║   22 operations. 12+1 dimensions.    ║\n");
    l7_puts("  ║   L7 Operating System — Stage 1      ║\n");
    l7_puts("  ╚══════════════════════════════════════╝\n\n");

    if (argc < 2) {
        l7_puts("Usage:\n");
        l7_puts("  prima run <sigil.l7b>       Execute compiled sigil bytecode\n");
        l7_puts("  prima asm <source.prima>    Assemble text source and execute\n");
        l7_puts("  prima info <sigil.l7b>      Print sigil information\n");
        l7_puts("  prima test                  Run built-in test sigil\n");
        l7_puts("\nSigil text format (one op per line):\n");
        l7_puts("  invoke capability=8 security=7\n");
        l7_puts("  decompose security=9 detail=9\n");
        l7_puts("  verify security=10\n");
        l7_puts("  complete\n\n");
        return 0;
    }

    if (streq(argv[1], "test")) {
        /* Built-in test: the Redemption Sigil */
        l7_puts("Assembling: The Redemption Sigil\n\n");
        const char *source =
            "invoke capability=8 security=7 transformation=4 direction=8\n"
            "decompose security=9 detail=9 transformation=9 consciousness=8\n"
            "verify security=10 intention=6 consciousness=7\n"
            "redeem capability=9 transformation=8 direction=7\n"
            "quarantine security=5 presentation=7 output=6\n"
            "publish detail=8 output=8 memory=9\n"
            "audit capability=5 direction=9 consciousness=9\n"
            "complete\n";

        u8 bytecode[4096];
        int size = assemble(source, l7_strlen(source), bytecode, 4096);
        if (size < 0) {
            l7_err("Assembly failed\n");
            return 1;
        }

        l7_puts("Assembled: ");
        l7_putn(size);
        l7_puts(" bytes\n\n");

        Sigil s;
        s.loaded = 0;
        int r = sigil_load(&s, bytecode, size);
        if (r < 0) {
            l7_err("Load failed: ");
            l7_putn(r);
            l7_err("\n");
            return 1;
        }

        return exec_sigil(&s) < 0 ? 1 : 0;
    }

    if (streq(argv[1], "run") && argc >= 3) {
        Sigil s;
        s.loaded = 0;
        int r = sigil_load_file(&s, argv[2]);
        if (r < 0) {
            l7_err("Failed to load sigil: ");
            l7_err(argv[2]);
            l7_err(" (error ");
            l7_putn(r);
            l7_err(")\n");
            return 1;
        }
        return exec_sigil(&s) < 0 ? 1 : 0;
    }

    if (streq(argv[1], "asm") && argc >= 3) {
        int fd = open(argv[2], O_RDONLY);
        if (fd < 0) {
            l7_err("Cannot open: ");
            l7_err(argv[2]);
            l7_err("\n");
            return 1;
        }
        struct stat st;
        fstat(fd, &st);
        char *src = (char *)mmap(0, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
        close(fd);
        if (src == MAP_FAILED) return 1;

        u8 bytecode[65536];
        int size = assemble(src, st.st_size, bytecode, 65536);
        munmap(src, st.st_size);

        if (size < 0) {
            l7_err("Assembly failed\n");
            return 1;
        }

        l7_puts("Assembled: ");
        l7_putn(size);
        l7_puts(" bytes\n\n");

        /* Write bytecode to .l7b file */
        char outpath[1024];
        int i = 0;
        while (argv[2][i] && i < 1000) { outpath[i] = argv[2][i]; i++; }
        /* Replace extension with .l7b */
        int dot = i;
        while (dot > 0 && outpath[dot-1] != '.') dot--;
        if (dot > 0) i = dot - 1;
        outpath[i] = '.'; outpath[i+1] = 'l'; outpath[i+2] = '7';
        outpath[i+3] = 'b'; outpath[i+4] = '\0';

        int ofd = open(outpath, O_WRONLY | O_CREAT | O_TRUNC, 0755);
        if (ofd >= 0) {
            write(ofd, bytecode, size);
            close(ofd);
            l7_puts("Wrote: ");
            l7_puts(outpath);
            l7_puts("\n\n");
        }

        /* Execute */
        Sigil s;
        s.loaded = 0;
        sigil_load(&s, bytecode, size);
        return exec_sigil(&s) < 0 ? 1 : 0;
    }

    if (streq(argv[1], "info") && argc >= 3) {
        Sigil s;
        s.loaded = 0;
        int r = sigil_load_file(&s, argv[2]);
        if (r < 0) {
            l7_err("Failed to load: ");
            l7_putn(r);
            l7_err("\n");
            return 1;
        }

        l7_puts("Sigil: ");
        l7_puts(argv[2]);
        l7_puts("\n  Version: ");
        l7_putn(s.header.version);
        l7_puts("\n  Operations: ");
        l7_putn(s.header.n_ops);
        l7_puts("\n  Edges: ");
        l7_putn(s.header.n_edges);
        l7_puts("\n  Astrocyte: ");
        l7_putf((f64)s.header.astrocyte / 65535.0);
        l7_puts("\n  Flags: ");
        if (s.header.flags & 1) l7_puts("sealed ");
        if (s.header.flags & 2) l7_puts("audited ");
        if (s.header.flags & 4) l7_puts("morph ");
        l7_puts("\n\n  Sequence:\n");

        for (int i = 0; i < s.header.n_ops; i++) {
            l7_puts("    ");
            l7_putn(i);
            l7_puts(". ");
            l7_puts(OP_LETTERS[s.ops[i].opcode]);
            l7_puts(" (");
            l7_puts(OP_NAMES[s.ops[i].opcode]);
            l7_puts(")\n");
        }

        if (s.header.n_edges > 0) {
            l7_puts("\n  Edges:\n");
            for (int i = 0; i < s.header.n_edges; i++) {
                l7_puts("    ");
                l7_puts(OP_NAMES[s.ops[s.edges[i].from].opcode]);
                l7_puts(" -> ");
                l7_puts(OP_NAMES[s.ops[s.edges[i].to].opcode]);
                l7_puts("  [");
                for (int d = 0; d < DIMS; d++) {
                    if (s.edges[i].weights[d] > 0) {
                        l7_puts(DIM_NAMES[d]);
                        l7_puts("=");
                        l7_putn(s.edges[i].weights[d] * 10 / 255);
                        l7_puts(" ");
                    }
                }
                l7_puts("]\n");
            }
        }

        return 0;
    }

    l7_err("Unknown command: ");
    l7_err(argv[1]);
    l7_err("\n");
    return 1;
}
