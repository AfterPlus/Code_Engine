package lcvharness;

import java.io.OutputStream;

/**
 * Size-capped buffer that receives the program's System.out / System.err.
 *
 * <p>The tracer reads {@code data} and {@code count} directly through the debugger at every step, which is how
 * printed output is attributed to the exact step that produced it.
 */
public final class Out extends OutputStream {

    public static final Out BUF = new Out(Integer.getInteger("lcv.maxOutput", 65536));

    public final byte[] data;
    public int count;
    public boolean truncated;

    private Out(int capacity) {
        this.data = new byte[capacity];
    }

    @Override
    public synchronized void write(int b) {
        if (count < data.length) data[count++] = (byte) b;
        else truncated = true;
    }

    @Override
    public synchronized void write(byte[] b, int off, int len) {
        int n = Math.min(len, data.length - count);
        System.arraycopy(b, off, data, count, n);
        count += n;
        if (n < len) truncated = true;
    }
}
