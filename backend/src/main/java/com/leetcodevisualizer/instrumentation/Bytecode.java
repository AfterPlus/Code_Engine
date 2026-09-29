package com.leetcodevisualizer.instrumentation;

import java.util.ArrayList;
import java.util.List;

/** Just enough of a JVM bytecode decoder to find loop back-edges. */
final class Bytecode {

    private Bytecode() {
    }

    /** Returns {sourceIndex, targetIndex} for every branch whose target precedes it. */
    static List<long[]> backwardJumps(byte[] code) {
        List<long[]> out = new ArrayList<>();
        int pc = 0;
        while (pc < code.length) {
            int op = code[pc] & 0xff;
            long target = -1;
            if ((op >= 0x99 && op <= 0xa8) || op == 0xc6 || op == 0xc7) {        // if*, goto, jsr, ifnull, ifnonnull
                target = pc + (short) (((code[pc + 1] & 0xff) << 8) | (code[pc + 2] & 0xff));
            } else if (op == 0xc8 || op == 0xc9) {                                 // goto_w, jsr_w
                target = pc + readInt(code, pc + 1);
            }
            if (target >= 0 && target < pc) out.add(new long[]{pc, target});
            pc += length(code, pc);
        }
        return out;
    }

    private static int length(byte[] code, int pc) {
        int op = code[pc] & 0xff;
        switch (op) {
            case 0x10, 0x12, 0x15, 0x16, 0x17, 0x18, 0x19, 0x36, 0x37, 0x38, 0x39, 0x3a, 0xa9, 0xbc:
                return 2;
            case 0x11, 0x13, 0x14, 0x84, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xbb, 0xbd, 0xc0, 0xc1, 0xc6, 0xc7:
                return 3;
            case 0xc5:
                return 4;
            case 0xb9, 0xba, 0xc8, 0xc9:
                return 5;
            case 0xc4: // wide
                return (code[pc + 1] & 0xff) == 0x84 ? 6 : 4;
            case 0xaa: { // tableswitch
                int p = align(pc);
                int low = readInt(code, p + 4);
                int high = readInt(code, p + 8);
                return p + 12 + (high - low + 1) * 4 - pc;
            }
            case 0xab: { // lookupswitch
                int p = align(pc);
                int pairs = readInt(code, p + 4);
                return p + 8 + pairs * 8 - pc;
            }
            default:
                if (op >= 0x99 && op <= 0xa8) return 3;
                return 1;
        }
    }

    private static int align(int pc) {
        return (pc + 4) & ~3;
    }

    private static int readInt(byte[] code, int p) {
        return ((code[p] & 0xff) << 24) | ((code[p + 1] & 0xff) << 16) | ((code[p + 2] & 0xff) << 8) | (code[p + 3] & 0xff);
    }
}
