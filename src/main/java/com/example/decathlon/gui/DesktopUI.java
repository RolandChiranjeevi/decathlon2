package com.example.decathlon.gui;

import javax.swing.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.ItemEvent;
import java.awt.*;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import com.example.decathlon.core.Competition;
import com.example.decathlon.core.CompetitionService;
import com.example.decathlon.core.CoreException;
import com.example.decathlon.core.ScoringService;
import com.example.decathlon.core.ScoringService.EventDef;
import com.example.decathlon.core.StateStore;

public class DesktopUI {

    private JTextField nameField;
    private JTextField resultField;
    private JComboBox<String> competitionBox;
    private JComboBox<String> disciplineBox;
    private JTextArea outputArea;
    private JTextArea standingsArea;

    private final ScoringService scoringService = new ScoringService();
    private final CompetitionService competition = new CompetitionService(scoringService);

    public static void main(String[] args) {
        new DesktopUI().createAndShowGUI();
    }

    private Competition selectedCompetition() {
        return "Heptathlon".equals(competitionBox.getSelectedItem())
                ? Competition.HEPTATHLON : Competition.DECATHLON;
    }

    private List<EventDef> currentEvents() {
        return scoringService.eventsFor(selectedCompetition());
    }

    private EventDef selectedEvent() {
        return currentEvents().get(disciplineBox.getSelectedIndex());
    }

    private void createAndShowGUI() {
        JFrame frame = new JFrame("Track and Field Calculator");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setSize(700, 500);

        JPanel formPanel = new JPanel(new GridLayout(8, 1));

        nameField = new JTextField(20);
        formPanel.add(new JLabel("Enter Competitor's Name:"));
        formPanel.add(nameField);

        competitionBox = new JComboBox<>(new String[]{"Decathlon", "Heptathlon"});
        competitionBox.addItemListener(ev -> {
            if (ev.getStateChange() == ItemEvent.SELECTED) {
                populateDisciplines();
            }
        });
        formPanel.add(new JLabel("Select Competition:"));
        formPanel.add(competitionBox);

        disciplineBox = new JComboBox<>();
        formPanel.add(new JLabel("Select Discipline:"));
        formPanel.add(disciplineBox);
        populateDisciplines();

        resultField = new JTextField(10);
        formPanel.add(new JLabel("Enter Result:"));
        formPanel.add(resultField);

        JPanel buttonPanel = new JPanel(new FlowLayout());
        JButton calculateButton = new JButton("Calculate Score");
        calculateButton.addActionListener(new CalculateButtonListener());
        buttonPanel.add(calculateButton);

        JButton loadButton = new JButton("Load Result");
        loadButton.setToolTipText("Fill in the stored result for this competitor and discipline so it can be changed");
        loadButton.addActionListener(e -> loadStoredResult());
        buttonPanel.add(loadButton);

        JButton exportButton = new JButton("Export CSV");
        exportButton.addActionListener(new ExportButtonListener(frame));
        buttonPanel.add(exportButton);

        JButton saveButton = new JButton("Save State");
        saveButton.addActionListener(new SaveStateListener(frame));
        buttonPanel.add(saveButton);

        JButton loadStateButton = new JButton("Load State");
        loadStateButton.addActionListener(new LoadStateListener(frame));
        buttonPanel.add(loadStateButton);
        formPanel.add(buttonPanel);

        outputArea = new JTextArea(8, 30);
        outputArea.setEditable(false);
        JScrollPane logScroll = new JScrollPane(outputArea);
        logScroll.setBorder(BorderFactory.createTitledBorder("Log"));

        standingsArea = new JTextArea(8, 30);
        standingsArea.setEditable(false);
        standingsArea.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        JScrollPane standingsScroll = new JScrollPane(standingsArea);
        standingsScroll.setBorder(BorderFactory.createTitledBorder("Standings"));

        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, logScroll, standingsScroll);
        splitPane.setResizeWeight(0.5);

        frame.setLayout(new BorderLayout());
        frame.add(formPanel, BorderLayout.NORTH);
        frame.add(splitPane, BorderLayout.CENTER);
        frame.setVisible(true);
    }

    private void populateDisciplines() {
        disciplineBox.removeAllItems();
        for (EventDef event : currentEvents()) {
            disciplineBox.addItem(event.label() + " (" + event.unit() + ")");
        }
    }

    private String formatResult(EventDef event, double value) {
        if ("cm".equals(event.unit())) {
            return String.format("%.0f%s", value, event.unit());
        }
        return String.format("%.2f%s", value, event.unit());
    }

    @SuppressWarnings("unchecked")
    private void updateStandings() {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> row : competition.standings()) {
            sb.append(row.get("position")).append(". ").append(row.get("name"))
                    .append(" - ").append(row.get("total")).append(" pts\n");
            Map<String, Integer> scores = (Map<String, Integer>) row.get("scores");
            Map<String, Double> raws = (Map<String, Double>) row.get("raw");
            scores.forEach((eventId, points) -> {
                EventDef event = scoringService.get(eventId);
                Double raw = raws.get(eventId);
                sb.append("     ").append(event.label()).append(": ")
                        .append(raw == null ? "-" : formatResult(event, raw))
                        .append(" = ").append(points).append(" pts\n");
            });
        }
        standingsArea.setText(sb.toString());
    }

    /** Edit support: puts the stored raw result for the typed name and chosen discipline into the result field. */
    private void loadStoredResult() {
        try {
            String name = CompetitionService.validateName(nameField.getText());
            EventDef event = selectedEvent();
            Double raw = competition.raw(name, event.id());
            if (raw == null) {
                JOptionPane.showMessageDialog(null, "No stored result for " + name + " in " + event.label() + ".",
                        "Nothing to Load", JOptionPane.INFORMATION_MESSAGE);
                return;
            }
            resultField.setText(plain(raw));
        } catch (CoreException ex) {
            showCoreError(null, "Invalid Input", ex);
        }
    }

    private static String plain(double value) {
        return java.math.BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    private static void showCoreError(java.awt.Component parent, String title, CoreException ex) {
        int type = ex.kind() == CoreException.Kind.INVALID ? JOptionPane.ERROR_MESSAGE : JOptionPane.WARNING_MESSAGE;
        JOptionPane.showMessageDialog(parent, ex.getMessage(), title, type);
    }

    private class CalculateButtonListener implements ActionListener {
        @Override
        public void actionPerformed(ActionEvent e) {
            try {
                String name = CompetitionService.validateName(nameField.getText());
                EventDef event = selectedEvent();
                double result = Double.parseDouble(resultField.getText().trim());
                scoringService.validate(event.id(), result);

                competition.addCompetitor(name, selectedCompetition());
                boolean replaced = competition.hasResult(name, event.id());
                int score = competition.score(name, event.id(), result);
                int total = competition.total(name);

                outputArea.append((replaced ? "Updated result for: " : "Competitor: ") + name + "\n");
                outputArea.append("Discipline: " + event.label() + "\n");
                outputArea.append("Result: " + formatResult(event, result) + "\n");
                outputArea.append("Score: " + score + "\n");
                outputArea.append("Total: " + total + "\n\n");

                updateStandings();
            } catch (NumberFormatException ex) {
                JOptionPane.showMessageDialog(null, "Please enter a valid number for the result.", "Invalid Input", JOptionPane.ERROR_MESSAGE);
            } catch (CoreException ex) {
                showCoreError(null, "Invalid Input", ex);
            }
        }
    }

    private class ExportButtonListener implements ActionListener {
        private final JFrame parent;

        ExportButtonListener(JFrame parent) {
            this.parent = parent;
        }

        @Override
        public void actionPerformed(ActionEvent e) {
            if (competition.standings().isEmpty()) {
                JOptionPane.showMessageDialog(parent, "No results to export yet.", "Nothing to Export", JOptionPane.WARNING_MESSAGE);
                return;
            }

            JFileChooser chooser = new JFileChooser();
            chooser.setSelectedFile(new File(CompetitionService.fileName("results", "csv")));
            int choice = chooser.showSaveDialog(parent);
            if (choice != JFileChooser.APPROVE_OPTION) {
                return;
            }

            File file = chooser.getSelectedFile();
            if (!confirmOverwrite(parent, file)) {
                return;
            }

            try {
                Files.writeString(file.toPath(), competition.exportCsv(), StandardCharsets.UTF_8);
                JOptionPane.showMessageDialog(parent, "Results exported to " + file.getAbsolutePath(), "Export Complete", JOptionPane.INFORMATION_MESSAGE);
            } catch (IOException ex) {
                JOptionPane.showMessageDialog(parent, "Could not write file: " + ex.getMessage(), "Export Failed", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private static boolean confirmOverwrite(JFrame parent, File file) {
        if (!file.exists()) return true;
        return JOptionPane.showConfirmDialog(parent, file.getName() + " already exists. Replace it?",
                "Replace File", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE) == JOptionPane.YES_OPTION;
    }

    /** Save/resume: the same JSON file the web page downloads and uploads. */
    private class SaveStateListener implements ActionListener {
        private final JFrame parent;

        SaveStateListener(JFrame parent) {
            this.parent = parent;
        }

        @Override
        public void actionPerformed(ActionEvent e) {
            JFileChooser chooser = new JFileChooser();
            chooser.setSelectedFile(new File(CompetitionService.fileName("decathlon-state", "json")));
            if (chooser.showSaveDialog(parent) != JFileChooser.APPROVE_OPTION) {
                return;
            }
            File file = chooser.getSelectedFile();
            if (!confirmOverwrite(parent, file)) {
                return;
            }
            try {
                StateStore.save(competition, file.toPath());
                JOptionPane.showMessageDialog(parent, "State saved to " + file.getAbsolutePath(), "Save Complete", JOptionPane.INFORMATION_MESSAGE);
            } catch (IOException ex) {
                JOptionPane.showMessageDialog(parent, "Could not save state: " + ex.getMessage(), "Save Failed", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private class LoadStateListener implements ActionListener {
        private final JFrame parent;

        LoadStateListener(JFrame parent) {
            this.parent = parent;
        }

        @Override
        public void actionPerformed(ActionEvent e) {
            JFileChooser chooser = new JFileChooser();
            if (chooser.showOpenDialog(parent) != JFileChooser.APPROVE_OPTION) {
                return;
            }
            File file = chooser.getSelectedFile();
            if (!competition.standings().isEmpty()
                    && JOptionPane.showConfirmDialog(parent, "Loading replaces the current competitors and results. Continue?",
                    "Replace Current Results", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE) != JOptionPane.YES_OPTION) {
                return;
            }
            try {
                StateStore.load(competition, file.toPath());
                updateStandings();
                JOptionPane.showMessageDialog(parent, "Loaded " + competition.standings().size() + " competitor(s) from " + file.getName(),
                        "Load Complete", JOptionPane.INFORMATION_MESSAGE);
            } catch (CoreException ex) {
                showCoreError(parent, "Load Failed", ex);
            } catch (IOException ex) {
                JOptionPane.showMessageDialog(parent, "Could not read file: " + ex.getMessage(), "Load Failed", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

}
