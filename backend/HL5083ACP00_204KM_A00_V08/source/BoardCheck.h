/*****************************************************************************
*                                                                            *
*       Source title:   BoardCheck.h                                         *
*                       (board checker for AccoTest programs)                *
*         Written by:   Alan Luo                                             *
*        Description:   Thx DH                                               *
*                                                                            *
*   Revision History:                                                        *
*                                                                            *
*     mm/dd/yy  r.rr  - Original coding.                                     *
*                                                                            *
*****************************************************************************/

/*
 REVISION BLOCK:
 -Rev. -- Date -------------------------------------------------------------------------------
   00   05/13/18  Initial Release.
   01	06/02/18  Fix test_cap issue, change slope caculation method
   02   07/09/18  User SERIAL_BC instead of SERIAL, 
				  Make test_r can test mohm level res
				  Add delay param for test_r
   03   07/11/18  Make it can be executed in UserLoad() (coding in test.cpp)
				  Required to test which site is connected (coding in diags.cpp)
				  Do check for connected sites, not active sites
				  Fix 02 Rev issue when Tester System set data save method as "Force to save"
   04	08/02/18  Add no connected site alarm (coding in diags.cpp)
				  Add dialog for connected site number confirm (coding in diags.cpp)
   05	08/10/18  Add test_r with fpvi, test_dio_L/H, test_v with QVM
				  Add test result by site to fail dialog title for operator easy check
                  Make message dialog more clear
				  All test_r/i/v/cap... function can return result for easy site connect check
				  Add test_cap1 which not use awg to test cap
   06  10/21/18   Fix multi-site result delog on dialog title un-correct issue.
   07  12/10/18   Fix qvm test_v unit scale issue
   08  2/21/19	  Test result dialog fail marked red
				  Make test_r with fpvi more accurate for < 200mOhm small resistor
				  Add include "assert.h"
				  Add test_cap/test_cap1 for fpvi
   09  04/26/19   Add exit selection in start dialog, updated diags.cpp
 ----------------------------------------------------------------------------------------------
*/


#pragma once
#include "stdafx.h"
#include <map>
#include <vector>
#include <string>
#include <Windows.h>
#include <iostream>
using namespace std;

#define BTN_REDO 2000
#define BTN_EXIT 2001
#define BTN_NONE 2002
#define BTN_CANCEL 2003

class DialogTemplate;

class DialogTemplate
{
public:
DialogTemplate(LPCSTR caption, DWORD style);

    DialogTemplate(LPCSTR caption, DWORD style, int x, int y, int w, int h,
        LPCSTR font = NULL, WORD fontSize = 8);
    void AddComponent(LPCSTR type, LPCSTR caption, DWORD style, DWORD exStyle,
        int x, int y, int w, int h, WORD id);
    void AddButton(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id);
    void AddEditBox(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id);
    void AddStatic(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id);
    void AddListBox(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id);
    void AddScrollBar(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id);
    void AddComboBox(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id);
    operator const DLGTEMPLATE*() const;
    virtual ~DialogTemplate();

protected:
    // Prevent copying and assignments (by private definition)
    DialogTemplate operator=(const DialogTemplate &x) {return *this;}
    DialogTemplate(DialogTemplate &x) {}

    void AddStandardComponent(WORD type, LPCSTR caption, DWORD style,
        DWORD exStyle, int x, int y, int w, int h, WORD id);
    void AlignData(int size);
    void AppendString(LPCSTR string);
    void AppendData(void* data, int dataLength);
    void EnsureSpace(int length);

private:

    DLGTEMPLATE* dialogTemplate;
    int totalBufferLength;
    int usedBufferLength;

};


////////////////
//
// Base classes For Windows interface
//
////////////////
class BoardCheckElement
{
public:
    virtual ~BoardCheckElement() {};
    virtual void get(HWND hDlg)=0;
    virtual void set(HWND hDlg)=0;
    virtual void dlg_file(HWND hDlg,char *fname,int len)=0;
    virtual int width()=0;
    virtual int height()=0;
    virtual void create_dialog(DialogTemplate *dialog,int x,int y,int *newid)=0;
    virtual void command(HWND hDlg,int code,int target_id) {};
    int id;
    static int tagged_filename;     // Allow tags names in file name components
};
typedef BoardCheckElement *LPBoardCheckElement;


class BoardCheckButton : public BoardCheckElement
{
public:
    BoardCheckButton(char *aname,int aid,int def_style=BS_PUSHBUTTON);
    virtual ~BoardCheckButton();
    virtual int width();
    virtual int height();
    virtual void get(HWND hDlg) {};
    virtual void set(HWND hDlg) {};
    virtual void dlg_file(HWND hDlg,char *fname,int len) {};
    virtual void create_dialog(DialogTemplate *dialog,int x,int y,int *newid);
protected:
    // Prevent copying and assignments (by private definition)
    BoardCheckButton operator=(const BoardCheckButton &x) {return *this;}
    BoardCheckButton(BoardCheckButton &x) {}
    char *name;
    int style;
};


class BoardCheckListBox : public BoardCheckElement
{
public:
    BoardCheckListBox(char *aname,int aid,int def_style=LBS_NOTIFY | WS_VSCROLL | WS_BORDER);
    virtual ~BoardCheckListBox();
    virtual int width();
    virtual int height();
    virtual void get(HWND hDlg) {};
    virtual void set(HWND hDlg) {};
    virtual void dlg_file(HWND hDlg,char *fname,int len) {};
    virtual void create_dialog(DialogTemplate *dialog,int x,int y,int *newid);
    //virtual void command(HWND hDlg,int code,int target_id);
protected:
    // Prevent copying and assignments (by private definition)
    BoardCheckListBox operator=(const BoardCheckListBox &x) {return *this;}
    BoardCheckListBox(BoardCheckListBox &x) {}
    char *name;
    int style;
};

class BoardCheckGroup : public BoardCheckElement
{
public:
    BoardCheckGroup(int vertical,int aospace,int aispace);
    virtual ~BoardCheckGroup();
    void add(BoardCheckElement *el);
    virtual int width();
    virtual int height();
    virtual void get(HWND hDlg);
    virtual void set(HWND hDlg);
    virtual void dlg_file(HWND hDlg,char *fname,int len);
    virtual void create_dialog(DialogTemplate *dialog,int x,int y,int *newid);
    virtual void command(HWND hDlg,int code,int target_id);
    int count();
protected:
    // Prevent copying and assignments (by private definition)
    BoardCheckGroup operator=(const BoardCheckGroup &x) {return *this;}
    BoardCheckGroup(BoardCheckGroup &x) {}
    int is_vertical;
    int no;
    int ospace;     // outer space (space to other elements)
    int ispace;     // inner space (space between elements)
    LPBoardCheckElement *member;
};


class CBC_log
{
public:
	CBC_log(void) {}
	~CBC_log(void) {}
	void clear(void) {
		component_vec.clear();
		tnum_map.clear();
		lolim_map.clear();
		hilim_map.clear();
		unit_map.clear();
		data_map.clear();
		flag_map.clear();
	}

	vector<string> component_vec;
	map<string, DWORD> tnum_map;				// map<component, test_number>
	map<string, double> lolim_map;				// map<component, low_lim>
	map<string, double> hilim_map;				// map<component, high_lim>
	map<string, string> unit_map;				// map<component, unit>
	map<string, map<DWORD, double>> data_map;	// map<component, map<site, data>>
	map<string, map<DWORD, string>> flag_map;	// map<component, map<site, pass or fail>>
};

class Cvi_config
{
public:
	Cvi_config(){
		mode = FV;
		v = 3;
		i = 0;
		v_range = FOVI_5V;
		i_range = FOVI_10MA;
		delay = 10; // ms
		sample_times = 100;
		sample_period = 10;	// us
	}

	void init(void){
		mode = FV;
		v = 3;
		i = 0;
		v_range = FOVI_5V;
		i_range = FOVI_10MA;
		delay = 10; // ms
		sample_times = 100;
		sample_period = 10;	// us	
	}
	void set(int mode_val = FV, double v_val = 3, double i_val = 0, FOVI_VRNG v_range_val = FOVI_5V, FOVI_IRNG i_range_val = FOVI_10MA, int delay_val = 10, int sample_times_val = 100, int sample_period_val = 10){
		mode = mode_val;
		v = v_val;
		i = i_val;
		v_range = v_range_val;
		i_range = i_range_val;
		delay = delay_val;
		sample_times = sample_times_val;
		sample_period = sample_period_val;
	}

	~Cvi_config() {}

	int mode;
	double v;
	double i;
	FOVI_VRNG v_range;
	FOVI_IRNG i_range;
	int delay;
	int sample_times;
	int sample_period;
};


class BoardCheck
{
public:
    BoardCheck();
    ~BoardCheck();
    void Sot();
    friend BOOL CALLBACK  BoardCheckDialogProc(HWND hDlg, UINT iMsg, WPARAM wParam, LPARAM lParam);

	FOVI_VRNG get_fovi_v_range(double v){
		if(v < 0)
			v = -v;
		if(v <= 1)
			return FOVI_1V;
		else if(v <= 5)
			return FOVI_5V;
		else if(v <= 10)
			return FOVI_10V;
		else if(v <= 20)
			return FOVI_20V;
		else if(v <= 50)
			return FOVI_50V;
		else 
			return FOVI_5V;
	}

	FOVI_IRNG get_fovi_i_range(double i){
		if(i < 0)
			i = -i;
		if(i <= 1e-6)
			return FOVI_1UA;
		else if(i <= 10e-6)
			return FOVI_10UA;
		else if(i <= 100e-6)
			return FOVI_100UA;
		else if(i <= 1e-3)
			return FOVI_1MA;
		else if(i <= 10e-3)
			return FOVI_10MA;
		else if(i <= 100e-3)
			return FOVI_100MA;
		else if(i <= 1)
			return FOVI_1A;
		else 
			return FOVI_1MA;
	}

	FPVI10_IRNG get_fpvi_i_range(double i){
		if(i < 0)
			i = -i;
		if(i <= 10e-6)
			return FPVI10_10UA;
		else if(i <= 100e-6)
			return FPVI10_100UA;
		else if(i <= 1e-3)
			return FPVI10_1MA;
		else if(i <= 10e-3)
			return FPVI10_10MA;
		else if(i <= 100e-3)
			return FPVI10_100MA;
		else if(i <= 1)
			return FPVI10_1A;
		else if(i <= 10)
			return FPVI10_10A;
		else 
			return FPVI10_1MA;
	}

	void SetSiteConnected(int site, BYTE value) {site_connected[site] = value;}
	BOOL GetSiteConnected(int site) { return site_connected[site]; }
	BOOL IsNoSiteConnected(void) { for(int site=0; site<SITE_NUM; ++site) if(site_connected[site]) return FALSE; return TRUE;}
	void ClearSiteConnected(void) { for(int site=0; site<SITE_NUM; ++site) site_connected[site] = 0; }
	BOOL IsCheckPass(void);
	int get_nBtn(void) {return nBtn;}
    void Display(void);
	BOOL output_format(void);
	BOOL report(void);

	// single ch fovi, force v, measure v
	BOOL test_v(FOVI &fovi_res, Cvi_config &vi, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);			
	// dual ch fovi shorted, one force v, one measure v
	BOOL test_v(FOVI &fovi_force, FOVI &fovi_measure, Cvi_config &vi, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	// dual ch fovi, force v, fpvi measure the diff of fovis
	BOOL test_v(FOVI &fovi_res1, FOVI &fovi_res2, FPVI10 &fpvi_res, DWORD tnum, const char* component, double *result1=NULL);										
	// QVM, measure v
	BOOL test_v(QVM &qvm_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);

	BOOL test_i(FOVI &fovi_res, Cvi_config &vi, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	BOOL test_r(FOVI &fovi_res, DWORD delay, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	BOOL test_r(FPVI10 &fpvi_res, DWORD delay, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);
	// use awg method to test cap with fovi
	BOOL test_cap(FOVI &fovi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);
	// not use awg to test cap with fovi
	BOOL test_cap1(FOVI &fovi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	// use awg method to test cap with fpvi
	BOOL test_cap(FPVI10 &fpvi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);
	// not use awg to test cap with fpvi
	BOOL test_cap1(FPVI10 &fpvi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	
	BOOL test_dio_init();
	BOOL test_dio_L(FOVI &fovi_res, int* dio_ch, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	BOOL test_dio_H(FOVI &fovi_res, int* dio_ch, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);
	// Test dio high z leak
	BOOL test_dio_Z(FOVI &fovi_res, int* dio_ch, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);	
	// Test fovi_res 1ms pulse
	BOOL test_qtmu(FOVI &fovi_res, QTMU_PLUS qtmu, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1=NULL);
	
	BOOL log(DWORD tnum, const char* component, double* result, double lolim, double hilim, const char* unit);

private:
    // Prevent copying and assignments (by private definition)
    BoardCheck operator=(const BoardCheck &x) {return *this;}
    BoardCheck(BoardCheck &x) {}
    void create_input(void);
    void delete_input(void);
    BoardCheckGroup *input;
    BoardCheckGroup *buttons;    // deleted with input
    BoardCheckGroup *listbox;    // deleted with input

    DialogTemplate *dialog;
	CBC_log bc_log;
	vector<string> display_vec;
	//int nMaxExtent;
	BOOL CheckPass;				// result of all site
	BOOL check_result[SITE_NUM];// result of each site
	int nBtn;
	BYTE site_connected[SITE_NUM];
};

