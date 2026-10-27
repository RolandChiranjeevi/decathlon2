package com.example.decathlon.api;

import com.example.decathlon.core.CompetitionService;
import com.example.decathlon.core.ScoringService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Wires the framework-free core classes into Spring. */
@Configuration
public class CoreConfig {

    @Bean
    public ScoringService scoringService() {
        return new ScoringService();
    }

    @Bean
    public CompetitionService competitionService(ScoringService scoring) {
        return new CompetitionService(scoring);
    }
}
