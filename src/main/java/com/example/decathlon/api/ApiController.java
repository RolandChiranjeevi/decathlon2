package com.example.decathlon.api;

import com.example.decathlon.core.Competition;
import com.example.decathlon.core.CompetitionRegistry;
import com.example.decathlon.core.CompetitionService;
import com.example.decathlon.core.CoreException;
import com.example.decathlon.core.ScoringService;
import com.example.decathlon.dto.ScoreReq;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Every competition route exists twice: /api/... acts on the default ("General") competition and
 * /api/competitions/{id}/... on the one with that id.
 */
@RestController
@RequestMapping({"/api", "/api/competitions/{cid}"})
public class ApiController {
    private final CompetitionRegistry registry;
    private final ScoringService scoring;

    public ApiController(CompetitionRegistry registry, ScoringService scoring) {
        this.registry = registry;
        this.scoring = scoring;
    }

    /** Every event with its unit and accepted range, so a page can show hints without repeating the rules. */
    @GetMapping("/events")
    public List<Map<String,Object>> events() {
        List<Map<String,Object>> list = new ArrayList<>();
        for (ScoringService.EventDef e : scoring.events()) {
            Map<String,Object> m = new LinkedHashMap<>();
            m.put("id", e.id());
            m.put("label", e.label());
            m.put("competition", e.competition().name());
            m.put("unit", e.unit());
            m.put("min", e.min());
            m.put("max", e.max());
            list.add(m);
        }
        return list;
    }

    // ---- Competitions ----

    @GetMapping("/competitions")
    public List<Map<String,Object>> competitions() {
        List<Map<String,Object>> list = new ArrayList<>();
        for (CompetitionService c : registry.list()) {
            list.add(describe(c));
        }
        return list;
    }

    /** Creates a competition. Body: {"name": "Göteborg Open", "type": "DECATHLON"} (or HEPTATHLON). */
    @PostMapping("/competitions")
    public ResponseEntity<Map<String,Object>> createCompetition(@RequestBody Map<String,String> body) {
        CompetitionService created = registry.create(body.get("name"), parseType(body.get("type")));
        return ResponseEntity.status(201).body(describe(created));
    }

    /** Renames a competition. Body: {"name": "New name"}. */
    @PostMapping("/name")
    public ResponseEntity<Void> renameCompetition(@PathVariable(name = "cid", required = false) String cid,
                                                  @RequestBody Map<String,String> body) {
        registry.rename(cid, body.get("name"));
        return ResponseEntity.noContent().build();
    }

    // ---- Competitors and results ----

    @PostMapping("/competitors")
    public ResponseEntity<Void> add(@PathVariable(name = "cid", required = false) String cid,
                                    @RequestBody Map<String,String> body) {
        registry.get(cid).addCompetitor(body.get("name"));
        return ResponseEntity.status(201).build();
    }

    /** Renames a competitor. Body: {"from": "Old name", "to": "New name"}. */
    @PostMapping("/competitors/rename")
    public ResponseEntity<Void> rename(@PathVariable(name = "cid", required = false) String cid,
                                       @RequestBody Map<String,String> body) {
        registry.get(cid).renameCompetitor(body.get("from"), body.get("to"));
        return ResponseEntity.noContent().build();
    }

    /** Removes a competitor and their results. Body: {"name": "Name"}. */
    @PostMapping("/competitors/remove")
    public ResponseEntity<Void> remove(@PathVariable(name = "cid", required = false) String cid,
                                       @RequestBody Map<String,String> body) {
        registry.get(cid).removeCompetitor(body.get("name"));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/score")
    public Map<String,Integer> score(@PathVariable(name = "cid", required = false) String cid,
                                     @RequestBody ScoreReq r) {
        int pts = registry.get(cid).score(r.name(), r.event(), r.raw());
        return Map.of("points", pts);
    }

    @GetMapping("/standings")
    public List<Map<String,Object>> standings(@PathVariable(name = "cid", required = false) String cid) {
        return registry.get(cid).standings();
    }

    @GetMapping("/export.csv")
    public ResponseEntity<String> export(@PathVariable(name = "cid", required = false) String cid) {
        CompetitionService c = registry.get(cid);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(CompetitionService.fileName(fileBase(c, "results"), "csv")))
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(c.exportCsv());
    }

    /** Save: the whole competition as a JSON file. */
    @GetMapping("/state")
    public ResponseEntity<String> saveState(@PathVariable(name = "cid", required = false) String cid) {
        CompetitionService c = registry.get(cid);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(CompetitionService.fileName(fileBase(c, "state"), "json")))
                .contentType(MediaType.APPLICATION_JSON)
                .body(c.exportState());
    }

    /** Resume: replaces the competition with an uploaded save. An invalid file gives 400 and changes nothing. */
    @PostMapping("/state")
    public ResponseEntity<Void> loadState(@PathVariable(name = "cid", required = false) String cid,
                                          @RequestBody String json) {
        registry.get(cid).importState(json);
        return ResponseEntity.noContent().build();
    }

    private static Map<String,Object> describe(CompetitionService c) {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("id", c.id());
        m.put("name", c.name());
        m.put("type", c.type() == null ? null : c.type().name());
        m.put("competitors", c.competitorCount());
        return m;
    }

    private static Competition parseType(String type) {
        try {
            return Competition.valueOf(type == null ? "" : type.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new CoreException(CoreException.Kind.INVALID, "Type must be Decathlon or Heptathlon");
        }
    }

    /** The default competition keeps the plain file names; named ones are prefixed with their name. */
    private static String fileBase(CompetitionService c, String kind) {
        if (CompetitionRegistry.DEFAULT_ID.equals(c.id())) {
            return "state".equals(kind) ? "decathlon-state" : kind;
        }
        return CompetitionService.slug(c.name()) + "-" + kind;
    }

    private static String attachment(String fileName) {
        return "attachment; filename=\"" + fileName + "\"";
    }

    @ExceptionHandler(CoreException.class)
    public ResponseEntity<String> coreError(CoreException e) {
        HttpStatus status = switch (e.kind()) {
            case INVALID -> HttpStatus.BAD_REQUEST;
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case LIMIT -> HttpStatus.TOO_MANY_REQUESTS;
        };
        return ResponseEntity.status(status).contentType(MediaType.TEXT_PLAIN).body(e.getMessage());
    }
}
