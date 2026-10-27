package com.example.decathlon.api;

import com.example.decathlon.core.CompetitionService;
import com.example.decathlon.core.CoreException;
import com.example.decathlon.dto.ScoreReq;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final CompetitionService comp;

    public ApiController(CompetitionService comp) { this.comp = comp; }

    @PostMapping("/competitors")
    public ResponseEntity<Void> add(@RequestBody Map<String,String> body) {
        comp.addCompetitor(body.get("name"));
        return ResponseEntity.status(201).build();
    }

    /** Renames a competitor. Body: {"from": "Old name", "to": "New name"}. */
    @PostMapping("/competitors/rename")
    public ResponseEntity<Void> rename(@RequestBody Map<String,String> body) {
        comp.renameCompetitor(body.get("from"), body.get("to"));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/score")
    public Map<String,Integer> score(@RequestBody ScoreReq r) {
        int pts = comp.score(r.name(), r.event(), r.raw());
        return Map.of("points", pts);
    }

    @GetMapping("/standings")
    public List<Map<String,Object>> standings() { return comp.standings(); }

    @GetMapping("/export.csv")
    public ResponseEntity<String> export() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(CompetitionService.fileName("results", "csv")))
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(comp.exportCsv());
    }

    /** Save: the whole competition as a JSON file. */
    @GetMapping("/state")
    public ResponseEntity<String> saveState() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, attachment(CompetitionService.fileName("decathlon-state", "json")))
                .contentType(MediaType.APPLICATION_JSON)
                .body(comp.exportState());
    }

    /** Resume: replaces the competition with an uploaded save. An invalid file gives 400 and changes nothing. */
    @PostMapping("/state")
    public ResponseEntity<Void> loadState(@RequestBody String json) {
        comp.importState(json);
        return ResponseEntity.noContent().build();
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
