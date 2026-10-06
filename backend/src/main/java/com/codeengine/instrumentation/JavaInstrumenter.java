package com.codeengine.instrumentation;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Prepares user source for compilation the way online judges do: default imports, an implicit
 * {@code class Solution} wrapper when only a method was pasted, and the standard {@code ListNode}/{@code TreeNode}
 * types when they are used but not declared.
 *
 * <p>Everything is inserted on the user's first line (or in separate files), so compiler diagnostics and
 * debugger line numbers map 1:1 onto the editor.
 */
public final class JavaInstrumenter {

    public static final String IMPORTS = "import java.util.*; import java.util.function.*; import java.util.stream.*; import java.math.*; ";

    private static final Pattern TOP_LEVEL_TYPE = Pattern.compile("\\b(class|interface|enum|record)\\s+([A-Za-z_$][\\w$]*)");
    private static final Pattern PUBLIC_TYPE = Pattern.compile("\\bpublic\\s+(?:final\\s+|abstract\\s+)*(?:class|interface|enum|record)\\s+([A-Za-z_$][\\w$]*)");
    private static final Pattern PACKAGE = Pattern.compile("^\\s*package\\s+[\\w.]+\\s*;");

    static final String WRAPPER = "class Solution { ";

    /** {@code injected} names helper classes added on the user's behalf (ListNode, TreeNode). */
    public record PreparedSource(Map<String, String> files, boolean wrapped, Set<String> injected) {
    }

    /** Length of the text inserted before the user's first line, for correcting column numbers. */
    public static int prefixLength(boolean wrapped) {
        return IMPORTS.length() + (wrapped ? WRAPPER.length() : 0);
    }

    public PreparedSource prepare(String code) {
        return prepare(code, null);
    }

    /** File name of the definitions unit; diagnostics from it are reported against the Definitions tab. */
    public static final String DEFINITIONS_FILE = "LcvDefinitions.java";

    private static final Pattern PUBLIC_MODIFIER = Pattern.compile(
            "(?m)^(\\s*)public\\s+(?=(?:final\\s+|abstract\\s+)*(?:class|interface|enum|record)\\b)");

    /**
     * @param definitions classes the judge supplies (TreeNode, ListNode, Node...), compiled as their own unit and
     *                    reported as injected (data, never traced); null or blank when there are none
     */
    public PreparedSource prepare(String code, String definitions) {
        String masked = maskCommentsAndStrings(code);
        // only one top-level type per file may be public, so definitions lose the modifier
        String defs = definitions == null || definitions.isBlank() ? null : PUBLIC_MODIFIER.matcher(definitions).replaceAll("$1");
        Set<String> defined = new LinkedHashSet<>();
        if (defs != null) {
            Matcher dm = TOP_LEVEL_TYPE.matcher(maskCommentsAndStrings(defs));
            while (dm.find()) defined.add(dm.group(2));
        }

        // A package declaration would have to precede our imports; blank it out (same length keeps columns).
        Matcher pkg = PACKAGE.matcher(masked);
        if (pkg.find()) {
            code = code.substring(0, pkg.start()) + " ".repeat(pkg.end() - pkg.start()) + code.substring(pkg.end());
            masked = maskCommentsAndStrings(code);
        }

        boolean hasTopLevelType = false;
        String firstPublic = null;
        Map<String, Boolean> declared = new LinkedHashMap<>();
        Matcher m = TOP_LEVEL_TYPE.matcher(masked);
        while (m.find()) {
            declared.put(m.group(2), true);
            if (depthAt(masked, m.start()) == 0) hasTopLevelType = true;
        }
        Matcher pub = PUBLIC_TYPE.matcher(masked);
        while (pub.find()) {
            if (depthAt(masked, pub.start()) == 0) {
                firstPublic = pub.group(1);
                break;
            }
        }

        Map<String, String> files = new LinkedHashMap<>();
        String main;
        String fileName;
        if (hasTopLevelType) {
            main = IMPORTS + code;
            fileName = firstPublic != null ? firstPublic : "Solution";
        } else {
            main = IMPORTS + WRAPPER + code + "\n}\n";
            fileName = "Solution";
        }
        files.put(fileName + ".java", main);

        Set<String> injected = new LinkedHashSet<>();
        if (defs != null) {
            files.put(DEFINITIONS_FILE, IMPORTS + defs);
            injected.addAll(defined);
        }
        for (String helper : new String[]{"ListNode", "TreeNode"}) {
            if (!declared.containsKey(helper) && !defined.contains(helper) && Pattern.compile("\\b" + helper + "\\b").matcher(masked).find()) {
                files.put(helper + ".java", readResource("/sandbox/defaults/" + helper + ".java"));
                injected.add(helper);
            }
        }
        return new PreparedSource(files, !hasTopLevelType, injected);
    }

    private static int depthAt(String masked, int pos) {
        int depth = 0;
        for (int i = 0; i < pos; i++) {
            char c = masked.charAt(i);
            if (c == '{') depth++;
            else if (c == '}') depth--;
        }
        return depth;
    }

    /** Replaces comments and string/char literal contents with spaces so regexes only see code. */
    static String maskCommentsAndStrings(String s) {
        StringBuilder out = new StringBuilder(s);
        int i = 0;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (c == '/' && i + 1 < n && s.charAt(i + 1) == '/') {
                while (i < n && s.charAt(i) != '\n') out.setCharAt(i++, ' ');
            } else if (c == '/' && i + 1 < n && s.charAt(i + 1) == '*') {
                while (i < n && !(s.charAt(i) == '*' && i + 1 < n && s.charAt(i + 1) == '/')) {
                    if (s.charAt(i) != '\n') out.setCharAt(i, ' ');
                    i++;
                }
                if (i < n) {
                    out.setCharAt(i++, ' ');
                    if (i < n) out.setCharAt(i++, ' ');
                }
            } else if (c == '"' && s.startsWith("\"\"\"", i)) {
                i += 3;
                while (i < n && !s.startsWith("\"\"\"", i)) {
                    if (s.charAt(i) != '\n') out.setCharAt(i, ' ');
                    i++;
                }
                i += 3;
            } else if (c == '"' || c == '\'') {
                i++;
                while (i < n && s.charAt(i) != c && s.charAt(i) != '\n') {
                    if (s.charAt(i) == '\\') out.setCharAt(i++, ' ');
                    if (i < n) out.setCharAt(i++, ' ');
                }
                i++;
            } else {
                i++;
            }
        }
        return out.toString();
    }

    static String readResource(String path) {
        try (InputStream in = JavaInstrumenter.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("Missing resource " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
