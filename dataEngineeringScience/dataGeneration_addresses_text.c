
/**
 * @file dataGeneration_addresses_text.c
 * @brief Generate TEXT addresses (sequential strings) in bank-file format.
 *
 * Format per file:
 *   xBBBBB\t(xBBBBB){
 *   RR
 *    \tKKKK\t<text_address>
 *   ...
 *   }
 *
 * Options:
 *   --banks N            number of banks (default 4)
 *   --regs N             registers per bank (default 8)
 *   --vals N             values (rows) per register (default 65536)
 *   --bank-max N         max rows per output file, will split to .partNN (clamped to [1e6..2e6])
 *   --out DIR            output directory (default ./db)
 *   --alphabet "chars"   alphabet for text addresses (default "abcdefghijklmnopqrstuvwxyz")
 *   --strlen N           starting fixed length (default 6); if capacity exceeded and growth enabled, auto-grows
 *   --scope S            sequence scope: bank | register | global  (default bank)
 *   --no-grow            disable auto growth; error if capacity exceeded
 *
 * Build:
 *   gcc -O2 -std=c11 -Wall -Wextra -o addrgen_text dataGeneration_addresses_text.c
 *   cl  /O2 /std:c11 dataGeneration_addresses_text.c
 * Run:
 *   .\addrgen_text --banks 10 --regs 64 --vals 20000 --out .\db --alphabet "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789" --strlen 3 --scope global
 */
#include <stdio.h>
#include <stdint.h>
#include <inttypes.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <ctype.h>

#ifdef _WIN32
  #include <direct.h>
  #define MKDIR(p) _mkdir(p)
  #define PATH_SEP '\\'
#else
  #include <sys/stat.h>
  #include <sys/types.h>
  #define MKDIR(p) mkdir(p, 0755)
  #define PATH_SEP '/'
#endif

typedef enum { SCOPE_BANK, SCOPE_REGISTER, SCOPE_GLOBAL } Scope;

typedef struct {
    uint64_t banks;
    uint64_t regs_per_bank;
    uint64_t vals_per_reg;
    uint64_t bank_max_lines;
    const char* outdir;

    char alphabet[1024];
    uint32_t alpha_len;
    uint32_t strlen_init;
    int grow;         // 1 = allow auto-growth
    Scope scope;
} Config;

static void die(const char* msg) {
    fprintf(stderr, "fatal: %s (errno=%d)\n", msg, errno);
    exit(1);
}

static int ensure_dir(const char* path) {
    if (MKDIR(path) == 0) return 0;
    if (errno == EEXIST) return 0;
    return -1;
}

static void usage(const char* prog) {
    fprintf(stderr,
        "Usage: %s [--banks N] [--regs N] [--vals N] [--bank-max N] [--out DIR]\n"
        "           [--alphabet CHARS] [--strlen N] [--scope bank|register|global] [--no-grow]\n", prog);
}

static int parse_u64(const char* s, uint64_t* out) {
    if (!s || !*s) return -1;
    char* end = NULL;
    unsigned long long v = strtoull(s, &end, 0);
    if (end == s || *end != '\0') return -1;
    *out = (uint64_t)v;
    return 0;
}

static Scope parse_scope(const char* s) {
    if (!s) return SCOPE_BANK;
    if (strcmp(s, "bank") == 0) return SCOPE_BANK;
    if (strcmp(s, "register") == 0) return SCOPE_REGISTER;
    if (strcmp(s, "global") == 0) return SCOPE_GLOBAL;
    fprintf(stderr, "Unknown scope '%s' (use bank|register|global)\n", s);
    exit(2);
}

static void parse_args(int argc, char** argv, Config* cfg) {
    cfg->banks = 4;
    cfg->regs_per_bank = 8;
    cfg->vals_per_reg = 65536;
    cfg->bank_max_lines = 1500000;
    cfg->outdir = "./db";
    strcpy(cfg->alphabet, "abcdefghijklmnopqrstuvwxyz");
    cfg->alpha_len = (uint32_t)strlen(cfg->alphabet);
    cfg->strlen_init = 6;
    cfg->grow = 1;
    cfg->scope = SCOPE_BANK;

    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--banks") == 0 && i + 1 < argc) {
            parse_u64(argv[++i], &cfg->banks);
        } else if (strcmp(argv[i], "--regs") == 0 && i + 1 < argc) {
            parse_u64(argv[++i], &cfg->regs_per_bank);
        } else if (strcmp(argv[i], "--vals") == 0 && i + 1 < argc) {
            parse_u64(argv[++i], &cfg->vals_per_reg);
        } else if (strcmp(argv[i], "--bank-max") == 0 && i + 1 < argc) {
            parse_u64(argv[++i], &cfg->bank_max_lines);
        } else if (strcmp(argv[i], "--out") == 0 && i + 1 < argc) {
            cfg->outdir = argv[++i];
        } else if (strcmp(argv[i], "--alphabet") == 0 && i + 1 < argc) {
            ++i;
            size_t L = strlen(argv[i]);
            if (L == 0 || L >= sizeof(cfg->alphabet)) { fprintf(stderr, "alphabet too long/empty\n"); exit(2); }
            strcpy(cfg->alphabet, argv[i]);
            cfg->alpha_len = (uint32_t)L;
        } else if (strcmp(argv[i], "--strlen") == 0 && i + 1 < argc) {
            uint64_t t=0; parse_u64(argv[++i], &t);
            if (t == 0 || t > 256) { fprintf(stderr, "--strlen must be 1..256\n"); exit(2); }
            cfg->strlen_init = (uint32_t)t;
        } else if (strcmp(argv[i], "--scope") == 0 && i + 1 < argc) {
            cfg->scope = parse_scope(argv[++i]);
        } else if (strcmp(argv[i], "--no-grow") == 0) {
            cfg->grow = 0;
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            usage(argv[0]); exit(0);
        } else {
            fprintf(stderr, "Unknown or incomplete option: %s\n", argv[i]);
            usage(argv[0]); exit(2);
        }
    }
    if (cfg->bank_max_lines < 1000000) cfg->bank_max_lines = 1000000;
    if (cfg->bank_max_lines > 2000000) cfg->bank_max_lines = 2000000;
    if (cfg->alpha_len < 2) { fprintf(stderr, "alphabet must have at least 2 characters\n"); exit(2); }
}

static FILE* xfopen(const char* path, const char* mode) {
    FILE* f = fopen(path, mode);
    if (!f) { perror(path); die("fopen failed"); }
    return f;
}

static int join2(char* out, size_t outsz, const char* a, const char* b) {
    int n = snprintf(out, outsz, "%s%c%s", a, PATH_SEP, b);
    if (n < 0 || (size_t)n >= outsz) return -1;
    return 0;
}

static void write_header(FILE* f, uint64_t bank_id5) {
    fprintf(f, "x%05" PRIu64 "\t(x%05" PRIu64 "){\n", bank_id5, bank_id5);
}
static void write_footer(FILE* f) { fputs("}\n", f); }

/* Convert sequential index -> text string in base |alphabet| with fixed length L.
 * idx=0 maps to all first alphabet char, then counting up lexicographically.
 * If idx >= alpha^L and growth enabled, increase L and recompute.
 * Buffer 'out' must have size >= L+1 (will be used with current dynamic L).
 * Returns current length used.
 */

static uint32_t index_to_text(uint64_t idx, char* out, size_t outcap,
                              const char* alphabet, uint32_t alpha_len,
                              uint32_t* pL, int grow) {
    uint32_t L = *pL;
    // ensure capacity; grow if needed
    uint64_t cap = 1;
    for (uint32_t i=0;i<L;i++) {
        if (cap > UINT64_MAX / alpha_len) { cap = UINT64_MAX; break; }
        cap *= alpha_len;
    }
    if (idx >= cap) {
        if (!grow) die("sequence capacity exceeded; re-run with larger --strlen or without --no-grow");
        // increase L until sufficient
        while (idx >= cap) {
            if (L >= 1024) die("strlen grew too large");
            if (cap > UINT64_MAX / alpha_len) cap = UINT64_MAX;
            else cap *= alpha_len;
            ++L;
        }
        *pL = L;
    }
    if (outcap < (size_t)L+1) die("output buffer too small for text address");

    // produce base-alpha_len representation, zero-based, left padded with first char
    for (int32_t pos = (int32_t)L-1; pos >= 0; --pos) {
        uint64_t q = idx / alpha_len;
        uint32_t r = (uint32_t)(idx % alpha_len);
        out[pos] = alphabet[r];
        idx = q;
    }
    out[L] = '\0';
    return L;
}

int main(int argc, char** argv) {
    Config cfg;
    parse_args(argc, argv, &cfg);

    if (ensure_dir(cfg.outdir) != 0) {
        fprintf(stderr, "warning: creating outdir '%s' failed (errno=%d). Will continue if it exists.\n", cfg.outdir, errno);
    }

    char outpath[1024];
    char fname[128];

    uint64_t global_idx = 0;

    for (uint64_t b = 0; b < cfg.banks; ++b) {
        uint64_t total_rows = cfg.regs_per_bank * cfg.vals_per_reg;
        uint64_t remaining = total_rows;
        uint64_t part = 0;

        FILE* f = NULL;
        if (total_rows > cfg.bank_max_lines) {
            int nf = snprintf(fname, sizeof(fname), "x%05" PRIu64 ".part%02" PRIu64 ".txt", b, part);
            if (nf < 0 || (size_t)nf >= sizeof(fname)) die("part filename overflow");
        } else {
            int nf = snprintf(fname, sizeof(fname), "x%05" PRIu64 ".txt", b);
            if (nf < 0 || (size_t)nf >= sizeof(fname)) die("bank filename overflow");
        }
        if (join2(outpath, sizeof(outpath), cfg.outdir, fname) != 0) die("path too long");
        f = xfopen(outpath, "w");
        write_header(f, b);

        uint64_t rows_in_this_part = 0;
        uint64_t bank_idx = 0;      // sequence index if scope=bank
        uint32_t currLen_bank = cfg.strlen_init;

        for (uint64_t r = 0; r < cfg.regs_per_bank; ++r) {
            uint64_t reg_idx = 0;   // sequence index if scope=register
            uint32_t currLen_reg = cfg.strlen_init;

            fprintf(f, "%02" PRIu64 "\n", r);

            for (uint64_t k = 0; k < cfg.vals_per_reg; ++k) {
                // choose which counter to use
                uint64_t seq_idx = 0;
                uint32_t* pLen = NULL;
                switch (cfg.scope) {
                    case SCOPE_GLOBAL:   seq_idx = global_idx; pLen = &cfg.strlen_init; break;
                    case SCOPE_BANK:     seq_idx = bank_idx;   pLen = &currLen_bank;    break;
                    case SCOPE_REGISTER: seq_idx = reg_idx;    pLen = &currLen_reg;     break;
                }

                char text[2048];
                (void)index_to_text(seq_idx, text, sizeof(text),
                                              cfg.alphabet, cfg.alpha_len,
                                              pLen, cfg.grow);

                // left label (4-digit wrap view)
                uint64_t k4 = k % 10000ULL;
                fprintf(f, "\t%04" PRIu64 "\t%s\n", k4, text);

                // advance the chosen counter(s)
                switch (cfg.scope) {
                    case SCOPE_GLOBAL:   ++global_idx; break;
                    case SCOPE_BANK:     ++bank_idx;   break;
                    case SCOPE_REGISTER: ++reg_idx;    break;
                }

                ++rows_in_this_part;
                --remaining;

                if (rows_in_this_part >= cfg.bank_max_lines && remaining > 0) {
                    write_footer(f);
                    fclose(f);
                    rows_in_this_part = 0;
                    ++part;

                    int nf = snprintf(fname, sizeof(fname), "x%05" PRIu64 ".part%02" PRIu64 ".txt", b, part);
                    if (nf < 0 || (size_t)nf >= sizeof(fname)) die("part filename overflow");
                    if (join2(outpath, sizeof(outpath), cfg.outdir, fname) != 0) die("path too long");
                    f = xfopen(outpath, "w");
                    write_header(f, b);
                    fprintf(f, "%02" PRIu64 "\n", r); // continue current register in new part
                }
            }
        }

        write_footer(f);
        fclose(f);
    }

    fprintf(stderr, "Text (sequential) address generation complete.\n");
    return 0;
}
